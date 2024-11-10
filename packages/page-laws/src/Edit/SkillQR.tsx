import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate.js';
import { CenterQRContainer, LessonRequest, LoginButton, SenderComponent, nameFromKeyringPair, qrWidthPx, useLoginContext } from '@slonigiraf/app-slonig-components';
import { Letter, getLessonId, getLettersByWorkerIdWithEmptyLesson, LawType, QRAction, QRField } from '@slonigiraf/db';
import { Spinner } from '@polkadot/react-components';
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import BN from 'bn.js';
import { BN_ONE } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import { useBlockTime } from '@polkadot/react-hooks';
import DiplomaCheck from './DiplomaCheck.js';
import { ItemWithCID } from '../types.js';

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
  // Always call hooks unconditionally
  const { api, isApiReady } = useApi();
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [blockAllowed, setBlockAllowed] = useState<BN>(new BN(1));
  const { currentPair, isLoggedIn } = useLoginContext();
  const { t } = useTranslation();
  const [diplomasToReexamine, setDiplomasToReexamine] = useState<Letter[]>();
  const [validDiplomas, setValidDiplomas] = useState<Letter[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [lessonId, setLessonId] = useState<string>('');
  const [learn, setLearn] = useState<string[][]>([]);
  const [reexamine, setReexamine] = useState<string[][]>([]);
  const [data, setData] = useState<string | null>(null);

  const shouldRender = selectedItems && selectedItems.length > 0 && (isLearningRequested || isReexaminingRequested);
  useEffect(() => {
    async function fetchBlockNumber() {
      if (isApiReady) {
        try {
          const chainHeader = await api.rpc.chain.getHeader();
          const currentBlockNumber = new BN(chainHeader.number.toString());
          // Allow to reexamine within the following time
          const secondsValid = 1800;
          const blockAllowed: BN = getBlockAllowed(currentBlockNumber, millisecondsPerBlock, secondsValid);
          setBlockAllowed(blockAllowed);
        } catch (error) {
          console.error("Error fetching block number: ", error);
        }
      }
    }
    fetchBlockNumber();
  }, [api, isApiReady, millisecondsPerBlock]);

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
  }, [currentPair, isLoggedIn, selectedItems, isLearningRequested]);

  // Generate tutoring request ID
  useEffect(() => {
    const generateTutoringRequestId = () => {
      if (selectedItems && selectedItems.length > 0) {
        setLessonId(getLessonId(selectedItems.map(item => item.id)));
      } else {
        setLessonId('');
      }
    };
    generateTutoringRequestId();
  }, [selectedItems]);

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
    if (shouldRender && diplomasToReexamine?.length) {
      const examData = diplomasToReexamine
        .filter(diploma => diploma !== null && diploma !== undefined)
        .map((diploma) => {
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
            ''
          ];
        });
      setReexamine(examData);
    }
  }, [diplomasToReexamine, shouldRender]);

  const name = nameFromKeyringPair(currentPair);
  const route = 'diplomas/tutor';
  const [action] = useState({ [QRField.QR_ACTION]: QRAction.LEARN_MODULE });
  const diplomaCheck = <DiplomaCheck id={id} cid={cid} caption={t('I have a diploma')} setValidDiplomas={setValidDiplomas} onLoad={() => setLoading(false)} />;
  const hasValidDiploma = validDiplomas && validDiplomas.length > 0;

  // Initialize learn request
  useEffect(() => {
    const dataIsNotEmpty = (learn.length + reexamine.length) > 0;
    if (dataIsNotEmpty) {
      const lessonRequest: LessonRequest = {
        cid: cid,
        learn: learn,
        reexamine: reexamine,
        lesson: lessonId,
        name: name,
        identity: studentIdentity,
      };
      setData(JSON.stringify(lessonRequest));
    } else {
      setData(null);
    }
  }, [learn, reexamine, cid, lessonId, name, studentIdentity]);

  return (
    <>
      {isLoggedIn && shouldRender && (
        <>
          {diplomaCheck}
          {loading ? <Spinner /> :
            !hasValidDiploma && (
              <>
                {
                  (type === LawType.MODULE && data && (
                    <StyledDiv>
                      <CenterQRContainer>
                        <SenderComponent
                          data={data}
                          route={route}
                          action={action}
                          textShare={t('Press the link to start tutoring')}
                        />
                      </CenterQRContainer>
                    </StyledDiv>
                  ))
                }
              </>
            )
          }
        </>
      )}
      {isLoggedIn && !shouldRender && <LoginButton />}
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

export default React.memo(SkillQR);