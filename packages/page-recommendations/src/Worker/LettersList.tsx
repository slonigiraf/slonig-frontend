// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import LetterInfo from './LetterInfo'
import React, { useCallback, useState } from 'react'
import { IPFS } from 'ipfs-core';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { Letter } from "./Letter";

interface Props {
  className?: string;
  ipfs: IPFS;
  worker: string;
  isSelecting: Boolean;
}

function LettersList({ className = '', ipfs, worker, isSelecting }: Props): React.ReactElement<Props> {
  const [selectedLetters, setSelectedLetters] = useState<Letter[]>([]);
  
  const toggleLetterSelection = (letter: Letter) => {
    if (selectedLetters.includes(letter)) {
      setSelectedLetters(prevLetters => prevLetters.filter(item => item !== letter));
    } else {
      setSelectedLetters(prevLetters => [...prevLetters, letter]);
    }
  };

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
        <div key={index} className='ui--row'>
          {
            isSelecting &&
            <input
              type="checkbox"
              checked={selectedLetters.includes(letter)}
              onChange={() => toggleLetterSelection(letter)}
            />
          }

          <LetterInfo letter={letter} ipfs={ipfs} />
        </div>
      ))}
    </div>)
}

export default React.memo(LettersList)