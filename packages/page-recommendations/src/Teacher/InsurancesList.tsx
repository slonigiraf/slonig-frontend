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

  // Initialize startDate and endDate as Date objects
  const [startDate, setStartDate] = useState<Date | null>(new Date(new Date().setHours(0, 0, 0, 0)));
  const [endDate, setEndDate] = useState<Date | null>(new Date(new Date().setHours(23, 59, 59, 999)));

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
      if (startDate) query = query.filter((insurance) => new Date(insurance.created) >= startDate);
      if (endDate) query = query.filter((insurance) => new Date(insurance.created) <= endDate);
      return query.sortBy('id').then((insurances) => insurances.reverse());
    },
    [teacher, student, startDate, endDate]
  );

  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>
        {studentName + ', ' + t('diplomas')}:
      </h2>
      <div className="ui--row">
        <div>
          <DateInput
            date={startDate}
            onDateChange={setStartDate}
            id="start_date_id"
            label={t('Dates of receipt')}
          />
          <StyledIcon icon="arrow-right" />
          <DateInput
            date={endDate}
            onDateChange={setEndDate}
            id="end_date_id"
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