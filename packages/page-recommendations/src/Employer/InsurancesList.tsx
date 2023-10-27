// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import InsuranceInfo from './InsuranceInfo'
import React from 'react'
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  employer: string;
}

function InsurancesList({ className = '', employer }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const insurances = useLiveQuery(
    () =>
      db.insurances
      .where("employer")
      .equals(employer)
      .sortBy("id"),
    [employer]
  );
  if (!insurances) return <div></div>;

  return (
    <div>
    {insurances.map((insurance, index) => (
        <InsuranceInfo key={index} insurance={insurance} ipfs={ipfs} />
    ))}
    </div>)
}
export default React.memo(InsurancesList)