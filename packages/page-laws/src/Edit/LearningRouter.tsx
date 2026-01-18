import React, { useCallback } from 'react';
import { useTranslation } from '../translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { useInfo, VerticallyCenteredModal } from '@slonigiraf/slonig-components';
import { useNavigate } from 'react-router-dom';
interface Props {
  question: string;
  courseId: string;
  isExam?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function LearningRouter({ question, courseId, isExam = false, onClose, onConfirm }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showInfo } = useInfo();

  const openCourse = useCallback(() => {
    if (courseId && courseId.length > 0) {
      navigate(`/knowledge?id=${courseId}&showSkillQr${isExam? '&exam':''}`, { replace: true });
      onClose();
    } else {
      showInfo(t('Select the course manually.'));
      onClose();
    }
  }, [courseId])

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        <Title>{question}</Title>
        <br />
        <ButtonsRow>
          <Button className='highlighted--button' label={t('Course (recommended)')} onClick={openCourse} />
          <Button label={t('Module')} onClick={onConfirm} />
        </ButtonsRow>
      </Modal.Content>
    </VerticallyCenteredModal>
  );
}
const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  .ui--Button {
    text-align: center;
  }
`;

const Title = styled.h1`
  width: 100%;
  text-align: center;
  margin: 0.5rem 0 0;
`;

export default React.memo(LearningRouter);