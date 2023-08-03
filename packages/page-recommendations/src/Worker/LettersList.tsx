// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import LetterInfo from './LetterInfo'
import React from 'react'
import { IPFS } from 'ipfs-core';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

interface Props {
  className?: string;
  ipfs: IPFS;
  worker: string;
}

function LettersList({ className = '', ipfs, worker }: Props): React.ReactElement<Props> {
  const letters = useLiveQuery(
    () =>
      db.letters
      .where("worker")
      .equals(worker)
      .sortBy("id"),
    [worker]
  );
  if (!letters) return <div></div>;

  return (
    <div>
      {letters.map((letter, index) => (
        <LetterInfo key={index} letter={letter} ipfs={ipfs} />
      ))}
    </div>)
}

export default React.memo(LettersList)