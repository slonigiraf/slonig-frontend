// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import LetterInfo from './LetterInfo.js'
import React, { useCallback, useState } from 'react'
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/index.js";
import { Letter } from "../db/Letter.js";
import { Button, styled, Icon } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { useLocation } from 'react-router-dom';
import SignLettersUseRight from './SignLettersUseRight.js'
import type { KeyringPair } from '@polkadot/keyring/types';
import { useInfo } from '@slonigiraf/app-slonig-components';
import 'react-dates/initialize';
import { SingleDatePicker } from 'react-dates';
import 'react-dates/lib/css/_datepicker.css';
import moment, { Moment } from 'moment';
import { useToggle } from '@polkadot/react-hooks';
import { Modal } from '@polkadot/react-components';

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
  const [startDate, setStartDate] = useState<Moment | null>(moment().startOf('day'));
  const [endDate, setEndDate] = useState<Moment | null>(moment().endOf('day'));
  const [startFocused, setStartFocused] = useState<boolean>(false);
  const [endFocused, setEndFocused] = useState<boolean>(false);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();

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
    icon={'square'}
    label={t('Select all')}
    onClick={_selectAll}
  />;

  const deselectionButton = <Button
    icon={'check'}
    label={t('Deselect all')}
    onClick={_deselectAll}
  />;

  const deleteSelectedButton = <Button
    icon={'trash'}
    label={t('Delete')}
    onClick={toggleDeleteConfirm}
  />;

  const selectDeselect = (selectedLetters.length === 0) ? selectionButton : deselectionButton;

  const sellInfo = (
    <div>
      <h3 style={{ margin: 0, marginRight: '10px' }}>
        {t('Select diplomas and send them')}:
      </h3>
      <SignLettersUseRight letters={selectedLetters} worker={worker} employer={employer} currentPair={currentPair} />
    </div>
  );

  const deleteDiplomas = async () => {
    // Extract IDs of the selected letters
    const idsToDelete = selectedLetters.map(letter => letter.id);
    try {
      for (const id of idsToDelete) {
        if(id){
          await db.letters.delete(id);
        }
      }
      showInfo(t('Diplomas deleted'));
    } catch (error) {
      // Handle any errors that occur during the deletion process
      console.error('Error deleting selected diplomas:', error);
      // Optionally, show an error message to the user
      showInfo(t('Deletion failed'));
    } finally {
      toggleDeleteConfirm();
    }
  };

  return (
    !letters ? <div></div> :
      <div>
        <h2>{t('My diplomas')}</h2>
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
            <StyledIcon icon='arrow-right' />
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
        {employer !== "" && sellInfo}
        <div className='ui--row'>
          {selectDeselect}
          {employer == "" && (selectedLetters.length > 0) && deleteSelectedButton}
        </div>
        {letters.map((letter, index) => (
          <div key={index} className='ui--row'>
            <LetterInfo
              letter={letter}
              isSelected={selectedLetters.includes(letter)}
              onToggleSelection={toggleLetterSelection} />
          </div>
        ))}
        {isDeleteConfirmOpen && <>
          <StyledModal
            header={t('Are you sure you want to delete the selected diplomas forever?')}
            onClose={toggleDeleteConfirm}
            size='small'
          >
            <Modal.Content>
              <StyledDiv>
                <Button
                  icon={'check'}
                  label={t('Yes')}
                  onClick={deleteDiplomas}
                />
                <Button
                  icon={'close'}
                  label={t('No')}
                  onClick={toggleDeleteConfirm}
                />
              </StyledDiv>

            </Modal.Content>
          </StyledModal>
        </>}
      </div>
  )
}
const StyledSingleDatePicker = styled(SingleDatePicker)`
`;
const StyledIcon = styled(Icon)`
  margin: 0 10px; // For the icon
`;
const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
`;
const StyledModal = styled(Modal)`
button[data-testid="close-modal"] {
  opacity: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}

button[data-testid="close-modal"]:focus {
  outline: none;
}
`;
export default React.memo(LettersList)