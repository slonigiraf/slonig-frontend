import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, VerticallyCenteredModal, KatexSpan, useLog } from './index.js';
import { Lesson, putLesson } from '@slonigiraf/db';
import { useNavigate } from 'react-router-dom';
interface Props {
  lesson: Lesson;
  onResult: () => void;
}

function SendResultsReminder({ lesson, onResult }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const { ipfs } = useIpfsContext();
  const { logEvent } = useLog();
  const navigate = useNavigate();
  const [lessonName, setLessonName] = useState('');

  const onClose = useCallback(async () => {
    const { deadline, ...noDeadline } = lesson;
    await putLesson(noDeadline);
    onResult();
  }, [lesson]);

  const onPostpone10Min = useCallback(async () => {
    await putLesson({...lesson, deadline: Date.now() + 10 * 60_000});
    onResult();
  }, [lesson]);

  const onSend = useCallback(async () => {
    await putLesson({...lesson, deadline: Date.now() + 3 * 60_000});
    navigate(`/badges/teach?tutorReminder=${lesson.id}`, { replace: true });
    onResult();
  }, [lesson]);

  useEffect(() => {
    logEvent('ALARM', 'LOAD_LESSON_RESULTS_ALARM', lessonName);
  }, [lessonName]);


  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && lesson) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, lesson.cid);
          const json = parseJson(content);
          setLessonName(json.h);
        }
        catch (e) {
          setLessonName(lesson.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, lesson])

  


  const url = getBaseUrl() + `/#/badges/teach?studentReminder=${lesson.id}`;



  const min = Math.round((Date.now() - lesson.created) / 60_000);

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        <StyledDiv>
          <h1>{t('You forgot to send lesson results')}</h1>
          <h2><KatexSpan content={lessonName} /></h2>
          <span>{t('🕑 {{min}} minutes ago', { replace: { min: min } })}</span>
        <FirstButtonsRow>
          <Button className='highlighted--button' label={t('Send')} onClick={onSend} />
          <Button className='highlighted--button' label={t('Cancel')} onClick={onClose} />
        </FirstButtonsRow>
        <SecondButtonsRow>
          <Button className='highlighted--button' label={t('Postpone for 10 minutes')} onClick={onPostpone10Min} />
        </SecondButtonsRow>
        </StyledDiv>
      </Modal.Content>
    </VerticallyCenteredModal >
  );
}
const FirstButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
  margin-top: 20px;
  .ui--Button {
    width: 100px;
    text-align: center;
  }
`;

const SecondButtonsRow = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  .ui--Button {
    width: 240px;
    text-align: center;
  }
`;

const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  text-align: center;
`;

export default React.memo(SendResultsReminder);