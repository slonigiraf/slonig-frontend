// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import InsuranceInfo from './InsuranceInfo.js'
import React, { useEffect, useState } from 'react'
import { styled, Icon } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/index.js";
import { useTranslation } from '../translate.js';
import { getPseudonym } from '../utils.js';
import 'react-dates/initialize';
import { SingleDatePicker } from 'react-dates';
import 'react-dates/lib/css/_datepicker.css';
import { Moment } from 'moment';

interface Props {
  className?: string;
  teacher: string;
  student: string;
  studentNameFromUrl: string;
}

function InsurancesList({ className = '', teacher, student, studentNameFromUrl }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [studentName, setStudentName] = useState<string | undefined>(studentNameFromUrl);
  const [startDate, setStartDate] = useState<Moment | null>(null);
  const [endDate, setEndDate] = useState<Moment | null>(null);
  const [startFocused, setStartFocused] = useState<boolean>(false);
  const [endFocused, setEndFocused] = useState<boolean>(false);

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
    fetchStudentName()
  }, [student, studentNameFromUrl])

  const insurances = useLiveQuery(
    () =>{
      let query = db.insurances.where("[employer+workerId]").equals([teacher, student]);
      if (startDate) query = query.filter(insurance => new Date(insurance.created) >= startDate.toDate());
      if (endDate) query = query.filter(insurance => new Date(insurance.created) <= endDate.toDate());
      return query.sortBy('id').then(insurances => insurances.reverse());
    },
    [teacher, student, startDate, endDate]
  );
  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>{studentName + ', ' + t('diplomas')}:</h2>
      <div className='ui--row'>
          <div>
            <StyledSingleDatePicker
              date={startDate}
              onDateChange={(date: Moment | null) => setStartDate(date)}
              focused={startFocused}
              onFocusChange={({ focused }: { focused: boolean }) => setStartFocused(focused)}
              id="start_date_id"
              isOutsideRange={() => false}
              numberOfMonths={1}
            />
            <StyledIcon icon='arrow-right'/>
            <StyledSingleDatePicker
              date={endDate}
              onDateChange={(date: Moment | null) => setEndDate(date)}
              focused={endFocused}
              onFocusChange={({ focused }: { focused: boolean }) => setEndFocused(focused)}
              id="end_date_id"
              isOutsideRange={() => false}
              numberOfMonths={1}
            />
          </div>
        </div>
      {insurances.map((insurance) => (
        <InsuranceInfo key={insurance.id} insurance={insurance} />
      ))}
    </div>)
}
const StyledSingleDatePicker = styled(SingleDatePicker)`
`;
const StyledIcon = styled(Icon)`
  margin: 0 10px; // For the icon
`;
export default React.memo(InsurancesList)