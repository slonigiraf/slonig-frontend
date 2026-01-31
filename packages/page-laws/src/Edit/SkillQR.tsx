import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate.js';
import { CenterQRContainer, LessonRequest, SenderComponent, nameFromKeyringPair, qrWidthPx, useLoginContext } from '@slonigiraf/slonig-components';
import { Letter, SettingKey, getLessonId, getLettersToReexamine, storeSetting } from '@slonigiraf/db';
import { keyForCid } from '@slonigiraf/slonig-components';
import { styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { ItemWithCID } from '../types.js';
import { EXAMPLE_MODULE_KNOWLEDGE_ID, EXAMPLE_SKILL_KNOWLEDGE_CID } from '@slonigiraf/utils';
interface Props {
  className?: string;
  id: string;
  cid: string;
  selectedItems: ItemWithCID[];
  isLearningRequested: boolean;
  isReexaminingRequested?: boolean;
  lessonInUrl?: boolean;
  onDataSent: (lessonId: string) => void;
}

function SkillQR({ className = '', id, cid, selectedItems, isLearningRequested, isReexaminingRequested, lessonInUrl, onDataSent }: Props): React.ReactElement<Props> | null {
  // Always call hooks unconditionally
  const { currentPair, isLoggedIn } = useLoginContext();
  const { t } = useTranslation();
  const [diplomasToReexamine, setDiplomasToReexamine] = useState<Letter[]>();
  const [lessonId, setLessonId] = useState<string>('');
  const [learn, setLearn] = useState<string[][]>([]);
  const [reexamine, setReexamine] = useState<string[][]>([]);
  const [data, setData] = useState<string | null>(null);

  const shouldRender = selectedItems && selectedItems.length > 0 && (isLearningRequested || isReexaminingRequested);

  useEffect(() => {
    if (id && id !== EXAMPLE_MODULE_KNOWLEDGE_ID) {
      storeSetting(SettingKey.FALLBACK_KNOWLEDGE_ID, id);
    }
  }, [id]);

  // Initialize learn request
  useEffect(() => {
    if (currentPair && isLoggedIn) {
      const newLearnData = selectedItems.map(item => {
        const diplomaKey = item.cid ? keyForCid(currentPair, item.cid) : null;
        const diplomaPublicKeyHex = diplomaKey?.publicKey ? u8aToHex(diplomaKey.publicKey) : '';
        const allowToIssueBadge = item.shouldBeRepeated || item.cid === EXAMPLE_SKILL_KNOWLEDGE_CID;
        return [item.id, item.cid, diplomaPublicKeyHex, allowToIssueBadge? '1' : '0'];
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
      const toReexamine = await getLettersToReexamine();
      if (toReexamine.length > 0) {
        setDiplomasToReexamine(toReexamine);
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
      const examData = diplomasToReexamine.map((badge) => [badge.cid, badge.amount, badge.pubSign, badge.referee]);
      setReexamine(examData);
    }
  }, [diplomasToReexamine, shouldRender]);

  const name = nameFromKeyringPair(currentPair);
  const route = lessonInUrl ? 'badges/teach/?lesson' : 'badges/teach';

  // Initialize learn request
  useEffect(() => {
    const dataIsNotEmpty = (learn.length + reexamine.length) > 0;
    if (dataIsNotEmpty) {
      const lessonRequest: LessonRequest = {
        cid: cid,
        kid: id,
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
              caption={isReexaminingRequested ? t('To exam this, ask a tutor to scan:') : t('To learn this, ask a tutor to scan:')}
              data={data}
              route={route}
              textShare={t('Press the link to start tutoring')}
              onDataSent={() => onDataSent(lessonId)}
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