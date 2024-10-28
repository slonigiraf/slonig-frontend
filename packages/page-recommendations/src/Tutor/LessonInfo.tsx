// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Progress, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react';
import { KatexSpan, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Lesson } from '../db/Lesson.js';
import { getPseudonym } from '../utils.js';

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
  const [text, setText] = useState(lesson.cid);
  const [loaded, setLoaded] = useState(false);
  const [studentName, setStudentName] = useState<string>('');
  const [userLocale, setUserLocale] = useState('en-US');

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

  return (
    <StyledDiv>
      {isSelectionAllowed && (
        <Button
          icon={isSelected ? 'check' : 'square'}
          onClick={() => onToggleSelection(lesson)}
        />
      )}

      <div>
        <Button
          icon="play"
          onClick={() => onResumeTutoring(lesson)}
          isDisabled={isSelectionAllowed || isFinished}
        />
      </div>
      <div style={{ width: '100%' }}>
        <div>
          <div><b>{formattedDate}, {studentName}</b></div>
          <div>{loaded ? <KatexSpan content={text} /> : <Spinner noLabel />}</div>
        </div>
      </div>

      <div>
        <Progress
          value={lesson.learnStep + lesson.reexamineStep}
          total={lesson.toLearnCount + lesson.toReexamineCount}
        />
      </div>
      <div>
        <Button
          icon="dollar"
          onClick={() => onShowResults(lesson)}
          isDisabled={isSelectionAllowed}
        />
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