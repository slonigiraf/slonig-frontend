// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import LetterInfo from './LetterInfo.js'
import React, { useCallback, useState } from 'react'
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/index.js";
import { Letter } from "../db/Letter.js";
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { useLocation } from 'react-router-dom';
import SignLettersUseRight from './SignLettersUseRight.js'
import type { KeyringPair } from '@polkadot/keyring/types';
import { useInfo } from '@slonigiraf/app-slonig-components';
import 'react-dates/initialize';
import { SingleDatePicker } from 'react-dates';
import 'react-dates/lib/css/_datepicker.css';
import moment from 'moment';

interface Props {
  className?: string;
  worker: string;
  currentPair: KeyringPair;
}

function LettersList({ className = '', worker, currentPair }: Props): React.ReactElement<Props> {
  const MAX_SELECTED_DIPLOMAS = 93; // 93 is what WhatsApp can handle during link sending
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const [selectedLetters, setSelectedLetters] = useState<Letter[]>([]);
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const employer = queryParams.get("teacher") || "";
  const { showInfo } = useInfo();
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);



  const toggleLetterSelection = (letter: Letter) => {
    if (selectedLetters.includes(letter)) {
      // This will remove the letter if it's already selected
      setSelectedLetters(prevLetters => prevLetters.filter(item => item !== letter));
    } else if (selectedLetters.length < MAX_SELECTED_DIPLOMAS) {
      // This will add a new letter only if fewer than MAX_SELECTED_DIPLOMAS are already selected
      setSelectedLetters(prevLetters => [...prevLetters, letter]);
    } else if (selectedLetters.length >= MAX_SELECTED_DIPLOMAS) {
      showInfo(t('Maximum number of selected diplomas is:') + ' ' + MAX_SELECTED_DIPLOMAS);
    }
  };


  const letters = useLiveQuery(
    () => {
      let query = db.letters.where("workerId").equals(worker);
      if (startDate) query = query.filter(letter => new Date(letter.created) >= startDate.toDate());
      if (endDate) query = query.filter(letter => new Date(letter.created) <= endDate.toDate());
      return query.sortBy('id').then(letters => letters.reverse());
    },
    [worker, startDate, endDate]
  );


  const _selectAll = useCallback(
    () => setSelectedLetters(letters),
    [letters]
  );

  const _deselectAll = useCallback(
    () => setSelectedLetters([]),
    []
  );

  const selectionButton = <Button
    icon={'fa-square'}
    label={t('Select all')}
    onClick={_selectAll}
  />;

  const deselectionButton = <Button
    icon={'fa-check'}
    label={t('Deselect all')}
    onClick={_deselectAll}
  />;

  const selectDeselect = (selectedLetters.length === 0) ? selectionButton : deselectionButton;



  const sellInfo = (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <h3 style={{ margin: 0, marginRight: '10px' }}>
        {t('Select diplomas and send them')}:
      </h3>
      <SignLettersUseRight letters={selectedLetters} worker={worker} employer={employer} currentPair={currentPair} />
    </div>
  );

  return (
    !letters ? <div></div> :
      <div>
        <h2>{t('My diplomas')}</h2>
        <div className='ui--row'>
          <div>
            <StyledSingleDatePicker
              date={startDate}
              onDateChange={date => setStartDate(date)}
              focused={startFocused}
              onFocusChange={({ focused }) => setStartFocused(focused)}
              id="start_date_id"
              isOutsideRange={() => false}
              numberOfMonths={1}
            // Other props as needed
            />

            <StyledSingleDatePicker
              date={endDate}
              onDateChange={date => setEndDate(date)}
              focused={endFocused}
              onFocusChange={({ focused }) => setEndFocused(focused)}
              id="end_date_id"
              isOutsideRange={() => false}
              numberOfMonths={1}
            // Other props as needed
            />
          </div>
        </div>
        {employer !== "" && sellInfo}
        <div className='ui--row'>
          {selectDeselect}
        </div>
        {letters.map((letter, index) => (
          <div key={index} className='ui--row'>
            <LetterInfo
              letter={letter}
              ipfs={ipfs}
              isSelected={selectedLetters.includes(letter)}
              onToggleSelection={toggleLetterSelection} />
          </div>
        ))}
      </div>

  )
}
const StyledSingleDatePicker = styled(SingleDatePicker)`
`;
export default React.memo(LettersList)