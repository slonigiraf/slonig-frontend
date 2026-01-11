import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate.js';
import { CenterQRContainer, LessonRequest, SenderComponent, nameFromKeyringPair, qrWidthPx, useLoginContext, EXAMPLE_SKILL_KNOWLEDGE_ID } from '@slonigiraf/slonig-components';
import { Letter, getLessonId, getLettersByWorkerId } from '@slonigiraf/db';
import { keyForCid } from '@slonigiraf/slonig-components';
import { styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { ItemWithCID } from '../types.js';
interface Props {
  className?: string;
  id: string;
  cid: string;
  type: number;
  selectedItems: ItemWithCID[];
  isLearningRequested: boolean;
  isReexaminingRequested?: boolean;
  lessonInUrl?: boolean;
  onDataSent: () => void;
}

function SkillQR({ className = '', cid, selectedItems, isLearningRequested, isReexaminingRequested, lessonInUrl, onDataSent}: Props): React.ReactElement<Props> | null {
  // Always call hooks unconditionally
  const { currentPair, isLoggedIn } = useLoginContext();
  const { t } = useTranslation();
  const [diplomasToReexamine, setDiplomasToReexamine] = useState<Letter[]>();
  const [lessonId, setLessonId] = useState<string>('');
  const [learn, setLearn] = useState<string[][]>([]);
  const [reexamine, setReexamine] = useState<string[][]>([]);
  const [data, setData] = useState<string | null>(null);

  const shouldRender = selectedItems && selectedItems.length > 0 && (isLearningRequested || isReexaminingRequested);

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
      if (currentPair?.publicKey && selectedItems && selectedItems.length > 0) {
        setLessonId(getLessonId(u8aToHex(currentPair?.publicKey), selectedItems.map(item => item.id)));
      } else {
        setLessonId('');
      }
    };
    generateTutoringRequestId();
  }, [currentPair, selectedItems]);

  const studentIdentity = u8aToHex(currentPair?.publicKey);

  // Which badges should be reexamined?
  useEffect(() => {
    const fetchRandomDiploma = async () => {
      const allDiplomas = await getLettersByWorkerId(studentIdentity);
      const notTutorialDiplomas = (allDiplomas ?? []).filter((letter: Letter) => letter.knowledgeId !== EXAMPLE_SKILL_KNOWLEDGE_ID);
      if (notTutorialDiplomas.length > 0) {
        const randomIndex = Math.floor(Math.random() * allDiplomas.length);
        setDiplomasToReexamine([allDiplomas[randomIndex]]);
      }
    };
    if (isLearningRequested && !isReexaminingRequested) {
      fetchRandomDiploma();
    } else if (isReexaminingRequested && selectedItems) {
      const validDiplomasArray = selectedItems
        .map(item => item.validDiplomas && item.validDiplomas.length > 0 ? item.validDiplomas[0] : null)
        .filter((badge): badge is Letter => badge !== null);
      setDiplomasToReexamine(validDiplomasArray);
    }
  }, [studentIdentity, isLearningRequested, isReexaminingRequested, selectedItems]);

  useEffect(() => {
    if (shouldRender && diplomasToReexamine?.length) {
      const examData = diplomasToReexamine.map((badge) => [badge.cid, badge.amount, badge.pubSign]);
      setReexamine(examData);
    }
  }, [diplomasToReexamine, shouldRender]);

  const name = nameFromKeyringPair(currentPair);
  const route = lessonInUrl? 'badges/teach/?lesson' : 'badges/teach';

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

  const showQR = isLoggedIn && shouldRender && data;

  return (
    <>
      {showQR && (
                    <StyledDiv className='test'>
                      <CenterQRContainer>
                        <SenderComponent
                          caption={isReexaminingRequested? t('To revise this, ask a tutor to scan:') : t('To learn this, ask a tutor to scan:')}
                          data={data}
                          route={route}
                          textShare={t('Press the link to start tutoring')}
                          onDataSent={onDataSent}
                        />
                      </CenterQRContainer>
                    </StyledDiv>
                  )}
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