// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import InsuranceInfo from './InsuranceInfo'
import React from 'react'
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate';

interface Props {
  className?: string;
  teacher: string;
  student: string;
}

function InsurancesList({ className = '', teacher, student }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();

  const insurances = useLiveQuery(
    () =>
      db.insurances
      .where("[employer+worker]")
      .equals([teacher, student])
      .sortBy("id"),
    [teacher, student]
  );
  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>{t('Students\' diplomas')}</h2>
    {insurances.map((insurance, index) => (
        <InsuranceInfo key={index} insurance={insurance} ipfs={ipfs} />
    ))}
    </div>)
}
export default React.memo(InsurancesList)