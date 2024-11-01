import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../translate.js';
import { CenterQRContainer, LawType, LoginButton, QRAction, QRField, QRWithShareAndCopy, SenderComponent, SettingKey, getBaseUrl, nameFromKeyringPair, qrWidthPx, useLoginContext } from '@slonigiraf/app-slonig-components';
import { Letter, getLessonId, getLettersByWorkerIdWithEmptyLesson, getSetting, storeSetting } from '@slonigiraf/db';
import { Dropdown, Spinner } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { useLocation } from 'react-router-dom';
import { styled } from '@polkadot/react-components';
import { u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import BN from 'bn.js';
import { BN_ONE } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import { useBlockTime } from '@polkadot/react-hooks';
import DiplomaCheck from './DiplomaCheck.js';
import { ItemWithCID } from '../types.js';
import { getAllPseudonyms } from '@slonigiraf/db';

interface Props {
  className?: string;
  id: string;
  cid: string;
  type: number;
  selectedItems: ItemWithCID[];
  isLearningRequested: boolean;
  isReexaminingRequested?: boolean;
}

const getBlockAllowed = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}

function SkillQR({ className = '', id, cid, type, selectedItems, isLearningRequested, isReexaminingRequested }: Props): React.ReactElement<Props> | null {
  if (!selectedItems || selectedItems.length === 0 || !(isLearningRequested || isReexaminingRequested)) {
    return null;
  }
  // Using key
  const { api, isApiReady } = useApi();
  // Last block number
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [blockAllowed, setBlockAllowed] = useState<BN>(new BN(1));
  const { currentPair, isLoggedIn } = useLoginContext();
  // Rest params
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const tutorFromQuery = queryParams.get("tutor");
  const [tutor, setTutor] = useState<string | null>(tutorFromQuery);
  const tutors = useLiveQuery(() => getAllPseudonyms(), []);
  const [diplomasToReexamine, setDiplomasToReexamine] = useState<Letter[]>();
  const [validDiplomas, setValidDiplomas] = useState<Letter[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [lessonId, setLessonId] = useState<string>('');
  const [learn, setLearn] = useState<string[][]>([]);
  const [reexamine, setReexamine] = useState<string[][]>([]);


  // Fetch block number (once)
  useEffect(() => {
    async function fetchBlockNumber() {
      if (isApiReady) {
        try {
          const chainHeader = await api.rpc.chain.getHeader();
          const currentBlockNumber = new BN(chainHeader.number.toString());
          //allow to reexamine within following time
          const secondsValid = 1800;
          const blockAllowed: BN = getBlockAllowed(currentBlockNumber, millisecondsPerBlock, secondsValid);
          setBlockAllowed(blockAllowed);
        } catch (error) {
          console.error("Error fetching block number: ", error);
        }
      }
    }
    fetchBlockNumber();
  }, [api, isApiReady]);

  // Initialize learn request
  useEffect(() => {
    if (currentPair && isLoggedIn) {
      const newLearnData = selectedItems.map(item => {
        const diplomaKey = item.cid ? keyForCid(currentPair, item.cid) : null;
        const diplomaPublicKeyHex = diplomaKey?.publicKey ? u8aToHex(diplomaKey.publicKey) : '';
        return [item.id, item.cid, diplomaPublicKeyHex];
      });
      if (isLearningRequested) {
        setLearn(newLearnData);
      }
    }
  }, [currentPair, diplomasToReexamine, selectedItems]);

  // Fetch tutor and set it as the default in the dropdown
  useEffect(() => {
    const fetchTutorSetting = async () => {
      if (tutorFromQuery) {
        await storeSetting(SettingKey.TUTOR, tutorFromQuery);
        setTutor(tutorFromQuery);
      } else {
        const tutorFromSettings = await getSetting(SettingKey.TUTOR);
        if (tutors && tutorFromSettings) {
          setTutor(tutorFromSettings);
        }
      }
    };
    fetchTutorSetting();
  }, [tutors, tutorFromQuery]);

  // Fetch date
  useEffect(() => {
    const date = new Date();
    setCurrentDate(date);
  }, []);

  useEffect(() => {
    const generateTutoringRequestId = () => {
      if (selectedItems !== undefined) {
        setLessonId(getLessonId(selectedItems.map(item => item.id)));
      }
    };
    if (selectedItems !== undefined && selectedItems.length > 0) {
      generateTutoringRequestId();
    } else {
      setLessonId('');
    }
  }, [selectedItems]);

  // Prepare dropdown options
  let tutorOptions = tutors?.map(tutor => ({
    text: tutor.pseudonym,
    value: tutor.publicKey
  }));

  // Check if 'tutor' is not null and not in 'tutorOptions'
  if (tutor && tutorOptions && !tutorOptions.some(option => option.value === tutor)) {
    // Add 'From web-link' as the first option
    tutorOptions = [{ text: t('From web-link'), value: tutor }, ...tutorOptions];
  }

  const handleTutorSelect = async (selectedKey: string) => {
    setTutor(selectedKey);
    if (selectedKey) {
      try {
        await storeSetting(SettingKey.TUTOR, selectedKey);
      } catch (error) {
        console.error('Error saving tutor selection:', error);
      }
    }
  };

  const studentIdentity = u8aToHex(currentPair?.publicKey);

  // Which diplomas should be reexamined?
  useEffect(() => {
    const fetchRandomDiploma = async () => {
      const allDiplomas = await getLettersByWorkerIdWithEmptyLesson(studentIdentity);
      if (allDiplomas.length > 0) {
        const randomIndex = Math.floor(Math.random() * allDiplomas.length);
        setDiplomasToReexamine([allDiplomas[randomIndex]]);
      }
    };
    if (isLearningRequested && !isReexaminingRequested) {
      fetchRandomDiploma();
    } else if (isReexaminingRequested && selectedItems) {
      const validDiplomasArray = selectedItems
        .map(item => item.validDiplomas && item.validDiplomas.length > 0 ? item.validDiplomas[0] : null)
        .filter((diploma): diploma is Letter => diploma !== null);
      setDiplomasToReexamine(validDiplomasArray);
    }
  }, [studentIdentity, isLearningRequested, isReexaminingRequested, selectedItems]);

  useEffect(() => {
    const showQR = async () => {
      _onSign();
    };
    showQR();
  }, [tutor, diplomasToReexamine, blockAllowed]);

  // Generate signatures for each diploma to be reexamined
  const _onSign = useCallback(async () => {
    if (!isLoggedIn || !currentPair || !diplomasToReexamine?.length || !tutor) {
      return;
    }

    const examData = diplomasToReexamine
      .filter(diploma => diploma !== null && diploma !== undefined)
      .map((diploma) => {
        const letterInsurance = getDataToSignByWorker(
          diploma.letterNumber,
          new BN(diploma.block),
          blockAllowed,
          hexToU8a(diploma.referee),
          hexToU8a(diploma.worker),
          new BN(diploma.amount),
          hexToU8a(diploma.signOverReceipt),
          hexToU8a(tutor)
        );

        const diplomaKey = keyForCid(currentPair, diploma.cid);
        const signature = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));

        return [
          diploma.cid,
          diploma.genesis,
          diploma.letterNumber.toString(),
          diploma.block,
          blockAllowed.toString(),
          diploma.referee,
          diploma.worker,
          diploma.amount,
          diploma.signOverPrivateData,
          diploma.signOverReceipt,
          signature
        ];
      });

    setReexamine(examData);
  }, [currentPair, tutor, diplomasToReexamine, blockAllowed, isLoggedIn]);


  const name = nameFromKeyringPair(currentPair);
  const reexamineData =
    diplomasToReexamine?.[0] && reexamine?.[0]
      ? `+${diplomasToReexamine[0].cid}+${diplomasToReexamine[0].genesis}+${diplomasToReexamine[0].letterNumber}+${diplomasToReexamine[0].block}+${blockAllowed.toString()}+${diplomasToReexamine[0].referee}+${diplomasToReexamine[0].worker}+${diplomasToReexamine[0].amount}+${diplomasToReexamine[0].signOverPrivateData}+${diplomasToReexamine[0].signOverReceipt}+${reexamine[0][10]}`
      : '';

  const diplomaPublicKeyHex = learn?.[0]?.[2] ?? '';
  const urlDetails = `diplomas/tutor?name=${encodeURIComponent(name)}&d=${tutor}+${cid}+${studentIdentity}+${diplomaPublicKeyHex}${reexamineData}`;

  const generateQRData = () => {
    return JSON.stringify({
      q: QRAction.SKILL,
      n: name,
      d: urlDetails,
    });
  };

  const qrCodeText = generateQRData();
  const url = `${getBaseUrl()}/#/${urlDetails}`;
  const route = `#/${urlDetails}`;
  const action = {
    [QRField.ID]: lessonId, [QRField.QR_ACTION]: QRAction.LEARN_MODULE,
    [QRField.PERSON_NAME]: name, [QRField.PERSON_IDENTITY]: studentIdentity, [QRField.TUTOR]: tutor
  };

  const diplomaCheck = <DiplomaCheck id={id} cid={cid} caption={t('I have a diploma')} setValidDiplomas={setValidDiplomas} onLoad={() => setLoading(false)} />;
  const hasValidDiploma = validDiplomas && validDiplomas.length > 0;

  const data = JSON.stringify({ 'cid': cid, 'learn': learn, 'reexamine': reexamine });

  return (<>
    {isLoggedIn
      && <>
        {diplomaCheck}
        {loading ? <Spinner /> :
          !hasValidDiploma && <>
            {tutor ?
              <StyledDiv>
                <CenterQRContainer>
                  <Dropdown
                    className={`dropdown ${className}`}
                    label={t('Show the QR to your tutor')}
                    value={tutor}
                    onChange={handleTutorSelect}
                    options={tutorOptions || []}
                  />
                  {type == LawType.MODULE && <SenderComponent
                    data={data} route={route} action={action}
                    textShare={t('Press the link to start tutoring')}
                  />}
                  {type == LawType.SKILL && <QRWithShareAndCopy
                    dataQR={qrCodeText}
                    titleShare={t('QR code')}
                    textShare={t('Press the link to start tutoring')}
                    urlShare={url}
                    dataCopy={url}
                  />}
                </CenterQRContainer>
              </StyledDiv>
              :
              <StyledDiv>
                <FlexRow>
                  <h3>{t('Scan your tutor\'s QR code for help and a diploma.')}</h3>
                </FlexRow>
              </StyledDiv>
            }
          </>
        }
      </>
    }
    <LoginButton label={t('Log in')} />
  </>
  );
}

const StyledDiv = styled.div`
  justify-content: center;
  align-items: center;
  .ui--Dropdown {
    width: ${qrWidthPx}px;
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
`;
const FlexRow = styled.div`
  display: flex;
  justify-content: left;
  align-items: left;
  margin-top: 20px;
`;
export default React.memo(SkillQR);