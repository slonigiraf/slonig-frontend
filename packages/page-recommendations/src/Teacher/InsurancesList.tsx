// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import InsuranceInfo from './InsuranceInfo.js'
import React, { useEffect, useState } from 'react'
import { styled, Icon } from '@polkadot/react-components';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
import { useTranslation } from '../translate.js';
import { getPseudonym } from '../utils.js';
import { DateInput } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  teacher: string;
  student: string;
  studentNameFromUrl: string;
}

function InsurancesList({ className = '', teacher, student, studentNameFromUrl }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [studentName, setStudentName] = useState<string | undefined>(studentNameFromUrl);

  // Initialize startDate and endDate as timestamps
  const [startDate, setStartDate] = useState<number | null>(new Date(new Date().setHours(0, 0, 0, 0)).getTime());
  const [endDate, setEndDate] = useState<number | null>(new Date(new Date().setHours(23, 59, 59, 999)).getTime());

  // Fetch student name
  useEffect(() => {
    async function fetchStudentName() {
      if (student && !studentNameFromUrl) {
        const pseudonym = await getPseudonym(student);
        if (pseudonym) {
          setStudentName(pseudonym);
        }
      }
    }
    fetchStudentName();
  }, [student, studentNameFromUrl]);

  const insurances = useLiveQuery(
    () => {
      let query = db.insurances.where('[employer+workerId]').equals([teacher, student]);
      query = query.filter((insurance) => {
        if (startDate && insurance.created < startDate) return false;
        if (endDate && insurance.created > endDate) return false;
        return true;
      });
      return query.sortBy('id').then((insurances) => insurances.reverse());
    },
    [teacher, student, startDate, endDate]
  );

  const startDateId = 'insurances:start';
  const endDateId = 'insurances:end';

  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>
        {studentName + ', ' + t('diplomas')}:
      </h2>
      <div className="ui--row">
        <div>
          <DateInput
            date={startDate ? new Date(startDate) : null}
            onDateChange={(date) => setStartDate(date ? date.getTime() : null)}
            id={startDateId}
            sessionStorageId={startDateId}
            label={t('Dates of receipt')}
          />
          <StyledIcon icon="arrow-right" />
          <DateInput
            date={endDate ? new Date(endDate) : null}
            onDateChange={(date) => setEndDate(date ? date.getTime() : null)}
            id={endDateId}
          />
        </div>
      </div>
      {insurances.map((insurance) => (
        <InsuranceInfo key={insurance.id} insurance={insurance} />
      ))}
    </div>
  );
}

const StyledIcon = styled(Icon)`
  margin: 0 10px;
`;

export default React.memo(InsurancesList);