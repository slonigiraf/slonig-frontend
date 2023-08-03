// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import InsuranceInfo from './InsuranceInfo'
import React from 'react'
import { IPFS } from 'ipfs-core';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

interface Props {
  className?: string;
  employer: string;
  ipfs: IPFS;
}

function InsurancesList({ className = '', ipfs, employer }: Props): React.ReactElement<Props> {
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