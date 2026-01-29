import LessonInfo from './LessonInfo.js';
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { DaysRangePicker, loadFromSessionStorage, saveToSessionStorage, SelectableList } from '@slonigiraf/slonig-components';
import { getLessons, getPenalties, Lesson, LetterTemplate } from '@slonigiraf/db';
import { LESSONS } from '../constants.js';
import PenaltyInfo from './PenaltyInfo.js';

interface Props {
  className?: string;
  tutor: string;
  onResumeTutoring: (lesson: Lesson) => void;
  onShowResults: (lesson: Lesson) => void;
}

function LessonsList({ className = '', tutor, onResumeTutoring, onShowResults }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const now = new Date();
  const defaultStart = new Date(now.setHours(0, 0, 0, 0));
  const defaultEnd = new Date(now.setHours(23, 59, 59, 999));

  // Initialize startDate and endDate
  const [startDate, setStartDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(LESSONS, 'start');
    return stored ? new Date(stored) : defaultStart;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(LESSONS, 'end');
    return stored ? new Date(stored) : defaultEnd;
  });

  const lessons = useLiveQuery<Lesson[]>(
    () => getLessons(tutor, startDate.getTime(), endDate.getTime()),
    [tutor, startDate, endDate]
  );

  const penalties = useLiveQuery<LetterTemplate[]>(() => getPenalties(), []);

  const isSelectionAllowed = false;

  return !lessons ? (
    <div></div>
  ) : (
    <div>
      <h2>{t('My lessons')}</h2>
      <div className="ui--row">
        <DaysRangePicker
          startDate={startDate || defaultStart}
          endDate={endDate || defaultEnd}
          onChange={(start: Date, end: Date) => {
            if (start) {
              setStartDate(start);
              saveToSessionStorage(LESSONS, 'start', start.toISOString());
            }
            if (end) {
              setEndDate(end);
              saveToSessionStorage(LESSONS, 'end', end.toISOString());
            }
          }}
        />
      </div>
      <Spacer />
      <SelectableList<Lesson>
        items={lessons}
        renderItem={(lesson, isSelected, isSelectionAllowed, onToggleSelection) => (
          <LessonInfo
            lesson={lesson}
            isSelected={isSelected}
            onToggleSelection={onToggleSelection}
            onResumeTutoring={onResumeTutoring}
            onShowResults={onShowResults}
            isSelectionAllowed={isSelectionAllowed}
          />
        )}
        onSelectionChange={() => { }}
        keyExtractor={(lesson) => lesson.id}
        key={tutor}
        isSelectionAllowed={isSelectionAllowed}
      />

      <h2>{t('I have been penalized for')}</h2>
      {penalties && penalties.map((item: LetterTemplate) => (
        <LetterTemplateInfo key={item.cid}>
          <PenaltyInfo badge={item} isSelected={false} onToggleSelection={() => { }} isSelectionAllowed={false} />
        </LetterTemplateInfo>
      ))}
    </div>

  );
}

const Spacer = styled.div`
  width: 100%;
  height: 5px;
`;
const LetterTemplateInfo = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: left;
  align-items: center;
  width: 100%;
  padding-left: 10px;
  gap: 20px;
`;
export default React.memo(LessonsList);