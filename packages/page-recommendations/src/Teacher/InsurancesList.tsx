// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import InsuranceInfo from './InsuranceInfo.js'
import React, {useEffect, useState} from 'react'
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/index.js";
import { useTranslation } from '../translate.js';
import { getPseudonym } from '../utils.js';

interface Props {
  className?: string;
  teacher: string;
  student: string;
}

function InsurancesList({ className = '', teacher, student }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [studentName, setStudentName] = useState<string | undefined>(undefined);
  // Fetch student name
  useEffect(() => {
    async function fetchStudentName() {
      if (student) {
        const pseudonym = await getPseudonym(student);
        if (pseudonym) {
          setStudentName(pseudonym);
        }
      }
    }
    fetchStudentName()
  }, [student])

  const insurances = useLiveQuery(
    () =>
      db.insurances
      .where("[employer+workerId]")
      .equals([teacher, student])
      .sortBy('id')
      .then(insurances => insurances.reverse()),
    [teacher, student]
  );
  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>{t(studentName + '\'s diplomas')}</h2>
    {insurances.map((insurance, index) => (
        <InsuranceInfo key={index} insurance={insurance} />
    ))}
    </div>)
}
export default React.memo(InsurancesList)