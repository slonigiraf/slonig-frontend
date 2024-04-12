import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../translate.js';
import { CenterQRContainer, LoginButton, QRAction, QRWithShareAndCopy, getBaseUrl, nameFromKeyringPair, qrWidthPx, useLoginContext } from '@slonigiraf/app-slonig-components';
import { getSetting, getValidLetters, storeSetting } from '@slonigiraf/app-recommendations';
import { Dropdown, Icon, Spinner } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db, Letter } from '@slonigiraf/app-recommendations';
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

interface Props {
  className?: string;
  id: string;
  cid: string;
}

const getBlockAllowed = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}

function SkillQR({ className = '', id, cid }: Props): React.ReactElement<Props> {
  // Using key
  const { api, isApiReady } = useApi();
  // Last block number
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [blockAllowed, setBlockAllowed] = useState<BN>(new BN(1));
  // Key management
  const [diplomaPublicKeyHex, setDiplomaPublicKeyHex] = useState("");
  const { currentPair, isLoggedIn } = useLoginContext();
  // Rest params
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const tutorFromQuery = queryParams.get("tutor");
  const [tutor, setTutor] = useState<string | null>(tutorFromQuery);
  const tutors = useLiveQuery(() => db.pseudonyms.toArray(), []);
  const [diplomaToReexamine, setDiplomaToReexamine] = useState<Letter | null>(null);
  const [studentSignatureOverDiplomaToReexamine, setStudentSignatureOverDiplomaToReexamine] = useState<string>("");
  const [validDiplomas, setValidDiplomas] = useState<Letter[]>();
  const [loading, setLoading] = useState<boolean>(true);


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

  // Initialize key
  useEffect((): void => {
    if (currentPair && isLoggedIn) {
      const diplomaKey = keyForCid(currentPair, cid);
      const diplomaPublicKeyHex = u8aToHex(diplomaKey?.publicKey);
      setDiplomaPublicKeyHex(diplomaPublicKeyHex);
    }
  }, [currentPair]);

  // Fetch tutor and set it as the default in the dropdown
  useEffect(() => {
    const fetchTutorSetting = async () => {
      if (tutorFromQuery) {
        await storeSetting("tutor", tutorFromQuery);
        setTutor(tutorFromQuery);
      } else {
        const tutorFromSettings = await getSetting("tutor");
        if (tutors && tutorFromSettings) {
          setTutor(tutorFromSettings);
        }
      }
    };
    fetchTutorSetting();
  }, [tutors, tutorFromQuery]);

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
        await storeSetting("tutor", selectedKey);
      } catch (error) {
        console.error('Error saving tutor selection:', error);
      }
    }
  };

  const studentIdentity = u8aToHex(currentPair?.publicKey);

  useEffect(() => {
    const fetchRandomDiploma = async () => {
      const allDiplomas = await db.letters.where('workerId').equals(studentIdentity).toArray();
      if (allDiplomas.length > 0) {
        const randomIndex = Math.floor(Math.random() * allDiplomas.length);
        setDiplomaToReexamine(allDiplomas[randomIndex]);
      }
    };
    fetchRandomDiploma();
  }, [studentIdentity]);

  useEffect(() => {
    const showQR = async () => {
      _onSign();
    };
    showQR();
  }, [tutor, diplomaToReexamine, blockAllowed]);

  const _onSign = useCallback(
    async () => {
      if (!isLoggedIn || !currentPair || !diplomaToReexamine || !tutor) {
        return;
      }
      // generate a data to sign    
      const letterInsurance = getDataToSignByWorker(diplomaToReexamine.letterNumber, new BN(diplomaToReexamine.block), blockAllowed, hexToU8a(diplomaToReexamine.referee),
        hexToU8a(diplomaToReexamine.worker), new BN(diplomaToReexamine.amount), hexToU8a(diplomaToReexamine.signOverReceipt), hexToU8a(tutor));

      const diplomaKey = keyForCid(currentPair, diplomaToReexamine.cid);
      const workerSignOverInsurance = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));
      // TODO: storeLetterUsageRight(letter, tutor, workerSignOverInsurance);
      // create the result text

      setStudentSignatureOverDiplomaToReexamine(workerSignOverInsurance);
    },
    [currentPair, tutor, diplomaToReexamine, blockAllowed]
  );

  const name = nameFromKeyringPair(currentPair);
  const reexamineData = diplomaToReexamine ? `+${diplomaToReexamine.cid}+${diplomaToReexamine.genesis}+${diplomaToReexamine.letterNumber}+${diplomaToReexamine.block}+${blockAllowed.toString()}+${diplomaToReexamine.referee}+${diplomaToReexamine.worker}+${diplomaToReexamine.amount}+${diplomaToReexamine.signOverPrivateData}+${diplomaToReexamine.signOverReceipt}+${studentSignatureOverDiplomaToReexamine}` : '';
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

  const diplomaCheck = <DiplomaCheck id={id} cid={cid} caption={t('I have a diploma')} setValidDiplomas={setValidDiplomas} onLoad={() => setLoading(false)} />;
  const hasValidDiploma = validDiplomas && validDiplomas.length > 0;

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
                  <QRWithShareAndCopy
                    dataQR={qrCodeText}
                    titleShare={t('QR code')}
                    textShare={t('Press the link to start tutoring')}
                    urlShare={url}
                    dataCopy={url}
                  />
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