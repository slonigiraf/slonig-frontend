// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import LetterInfo from './LetterInfo.js'
import React, { useState } from 'react'
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/index.js";
import { Letter } from "../db/Letter.js";
import { Button, styled, Icon } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { useLocation } from 'react-router-dom';
import SignLettersUseRight from './SignLettersUseRight.js'
import type { KeyringPair } from '@polkadot/keyring/types';
import { SelectableList, useInfo } from '@slonigiraf/app-slonig-components';
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
  const MAX_SELECTED_DIPLOMAS = 93;
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const employer = queryParams.get('teacher') || '';
  const { showInfo } = useInfo();
  const [startDate, setStartDate] = useState<Moment | null>(moment().startOf('day'));
  const [endDate, setEndDate] = useState<Moment | null>(moment().endOf('day'));
  const [startFocused, setStartFocused] = useState<boolean>(false);
  const [endFocused, setEndFocused] = useState<boolean>(false);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();

  const letters = useLiveQuery<Letter[]>(
    () => {
      let query = db.letters.where('workerId').equals(worker);
      if (startDate) query = query.filter((letter) => new Date(letter.created) >= startDate.toDate());
      if (endDate) query = query.filter((letter) => new Date(letter.created) <= endDate.toDate());
      return query.sortBy('id').then((letters) => letters.reverse());
    },
    [worker, startDate, endDate]
  );

  const [selectedLetters, setSelectedLetters] = useState<Letter[]>([]);

  const handleSelectionChange = (newSelectedLetters: Letter[]) => {
    if (newSelectedLetters.length > MAX_SELECTED_DIPLOMAS) {
      showInfo(t('Maximum number of selected diplomas is:') + ' ' + MAX_SELECTED_DIPLOMAS);
      return;
    }
    setSelectedLetters(newSelectedLetters);
  };

  const deleteDiplomas = async () => {
    const idsToDelete = selectedLetters.map((letter) => letter.id);
    try {
      for (const id of idsToDelete) {
        if (id) {
          await db.letters.delete(id);
        }
      }
      showInfo(t('Diplomas deleted'));
      setSelectedLetters([]);
    } catch (error) {
      console.error('Error deleting selected diplomas:', error);
      showInfo(t('Deletion failed'));
    } finally {
      toggleDeleteConfirm();
    }
  };

  // Define the Delete button
  const deleteSelectedButton =
    employer === '' && selectedLetters.length > 0 && (
      <Button icon="trash" label={t('Delete')} onClick={toggleDeleteConfirm} />
    );

  return !letters ? (
    <div></div>
  ) : (
    <div>
      <h2>{t('My diplomas')}</h2>
      <div className="ui--row">
        <div>
          <SingleDatePicker
            date={startDate}
            onDateChange={(date: Moment | null) => setStartDate(date)}
            focused={startFocused}
            onFocusChange={({ focused }: { focused: boolean }) => setStartFocused(focused)}
            id="start_date_id"
            isOutsideRange={() => false}
            numberOfMonths={1}
          />
          <StyledIcon icon="arrow-right" />
          <SingleDatePicker
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
      {employer !== '' && (
        <div>
          <SignLettersUseRight
            letters={selectedLetters}
            worker={worker}
            employer={employer}
            currentPair={currentPair}
          />
        </div>
      )}
      <SelectableList<Letter>
        items={letters}
        renderItem={(letter, isSelected, onToggleSelection) => (
          <LetterInfo
            letter={letter}
            isSelected={isSelected}
            onToggleSelection={onToggleSelection}
          />
        )}
        onSelectionChange={handleSelectionChange}
        maxSelectableItems={MAX_SELECTED_DIPLOMAS}
        additionalControls={deleteSelectedButton}
        keyExtractor={(letter, index) => letter.signOverReceipt ?? index}
      />
      {isDeleteConfirmOpen && (
        <StyledModal
          header={t('Are you sure you want to delete the selected diplomas forever?')}
          onClose={toggleDeleteConfirm}
          size="small"
        >
          <Modal.Content>
            <StyledDiv>
              <Button icon="check" label={t('Yes')} onClick={deleteDiplomas} />
              <Button icon="close" label={t('No')} onClick={toggleDeleteConfirm} />
            </StyledDiv>
          </Modal.Content>
        </StyledModal>
      )}
    </div>
  );
}

const StyledIcon = styled(Icon)`
  margin: 0 10px;
`;
const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
`;
const StyledModal = styled(Modal)`
  button[data-testid='close-modal'] {
    opacity: 0;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  button[data-testid='close-modal']:focus {
    outline: none;
  }
`;

export default React.memo(LettersList);