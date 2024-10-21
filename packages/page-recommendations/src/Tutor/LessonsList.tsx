import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
import { Lesson } from '../db/Lesson.js';
import { styled, Icon } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { DateInput } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  tutor: string;
}

function LessonsList({ className = '', tutor }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  // Initialize startDate and endDate as Date objects
  const [startDate, setStartDate] = useState<Date | null>(new Date(new Date().setHours(0, 0, 0, 0)));
  const [endDate, setEndDate] = useState<Date | null>(new Date(new Date().setHours(23, 59, 59, 999)));

  const lessons = useLiveQuery<Lesson[]>(
    () => {
      let query = db.lessons.where('tutor').equals(tutor);
      if (startDate)
        query = query.filter((lesson) => new Date(lesson.created) >= startDate);
      if (endDate)
        query = query.filter((lesson) => new Date(lesson.created) <= endDate);
      return query.sortBy('id').then((lessons) => lessons.reverse());
    },
    [tutor, startDate, endDate]
  );

  return !lessons ? (
    <></>
  ) : (
    <div className={className}>
      <h2>{t('My lessons')}</h2>
      <div className="ui--row">
        <div>
          <DateInput
            date={startDate}
            onDateChange={setStartDate}
            id="start_date_id"
            label={t('Lesson dates')}
          />
          <StyledIcon icon="arrow-right" />
          <DateInput
            date={endDate}
            onDateChange={setEndDate}
            id="end_date_id"
          />
        </div>
      </div>
      <div className="ui--row">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>CID</th>
              <th>Created</th>
              {/* Add more headers if needed */}
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <tr key={lesson.id}>
                <td>{lesson.id}</td>
                <td>{lesson.cid}</td>
                <td>{new Date(lesson.created).toLocaleString()}</td>
                {/* Add more fields if needed */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const StyledIcon = styled(Icon)`
  margin: 0 10px;
`;

export default React.memo(LessonsList);