// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Progress, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect, useCallback } from 'react';
import { KatexSpan, getIPFSDataFromContentID, parseJson, useLog } from '@slonigiraf/slonig-components';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/slonig-components';
import { Lesson, getPseudonym, isThereAnyLessonResult } from '@slonigiraf/db';

interface Props {
  lesson: Lesson;
  isSelected: boolean;
  onToggleSelection: (lesson: Lesson) => void;
  onResumeTutoring: (lesson: Lesson) => void;
  onShowResults: (lesson: Lesson) => void;
  isSelectionAllowed: boolean;
}

function LessonInfo({ lesson, isSelected, onToggleSelection, onResumeTutoring, onShowResults, isSelectionAllowed }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [text, setText] = useState(lesson.cid);
  const [loaded, setLoaded] = useState(false);
  const [studentName, setStudentName] = useState<string>('');
  const [userLocale, setUserLocale] = useState('en-US');
  const [isSendingResultsEnabled, setIsSendingResultsEnabled] = useState(false);

  useEffect(() => {
    const locale = navigator.language || 'en-US';
    setUserLocale(locale);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && text === lesson.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, lesson.cid);
          const json = parseJson(content);
          setText(json.h);
          setLoaded(true);
        } catch (e) {
          setText(`${lesson.cid} (${t('loading')}...)`);
          console.log(e);
        }
      }
    }
    fetchData();
  }, [ipfs, lesson, text, t]);

  // Fetch student name
  useEffect(() => {
    async function fetchStudentName() {
      const pseudonym = await getPseudonym(lesson.student);
      if (pseudonym) {
        setStudentName(pseudonym);
      }
    }
    fetchStudentName();
  }, [lesson]);

  const formattedDate = lesson.created ? new Intl.DateTimeFormat(userLocale).format(new Date(lesson.created)) : '';
  const isFinished = (lesson.learnStep + lesson.reexamineStep) ===
    (lesson.toLearnCount + lesson.toReexamineCount)

  const progressValue = lesson.learnStep + lesson.reexamineStep;
  const progressTotal = lesson.toLearnCount + lesson.toReexamineCount;

  useEffect(() => {
    const checkResults = async () => {
      if (lesson) {
        setIsSendingResultsEnabled(await isThereAnyLessonResult(lesson?.id));
      }
    }
    checkResults();
  }, [lesson]);

  const resumeTutoring = useCallback((lesson: Lesson) => {
    logEvent('TUTORING', 'RESTART_LESSON', text);
    onResumeTutoring(lesson);
  }, [logEvent, onResumeTutoring, text]);

  return (
    <StyledDiv>
      {isSelectionAllowed && (
        <Button className='inList'
          icon={isSelected ? 'check' : 'square'}
          onClick={() => onToggleSelection(lesson)}
        />
      )}
      <div>
        {!isSelectionAllowed ? <Button
          icon='play'
          onClick={() => resumeTutoring(lesson)}
          isDisabled={isSelectionAllowed || isFinished}
        /> : <span>&nbsp;</span>}
      </div>
      <div style={{ width: '100%' }}>
        <div>
          <div><b>{formattedDate}, {studentName}</b></div>
          <div>{loaded ? <KatexSpan content={text} /> : <Spinner noLabel />}</div>
        </div>
      </div>

      <div>
        <Progress
          value={progressValue}
          total={progressTotal}
        />
      </div>
      <div>
        {!isSelectionAllowed && <Button
          icon='paper-plane'
          onClick={() => {
            logEvent('TUTORING', 'RESULTS', 'click_send_at_list_of_lessons');
            onShowResults(lesson);
          }}
          isDisabled={!isSendingResultsEnabled}
        />}
      </div>
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  .ui--Spinner {
    width: 50px;
    margin-left: 25px;
    margin-right: 25px;
  }
`;

export default React.memo(LessonInfo);