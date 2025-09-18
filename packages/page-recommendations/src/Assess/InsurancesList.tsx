// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Toggle } from '@polkadot/react-components';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from '../translate.js';
import { deleteInsurance, Badge, getInsurances, getPseudonym, Insurance } from '@slonigiraf/db';
import { Confirmation, DaysRangePicker, loadFromSessionStorage, saveToSessionStorage, SelectableList, ToggleContainer, useInfo } from '@slonigiraf/app-slonig-components';
import { useToggle } from '@polkadot/react-hooks';
import BadgeInfo from './BadgeInfo.js';
import { INSURANCES } from '../constants.js';

interface Props {
  className?: string;
  teacher: string;
  student: string;
  studentNameFromUrl: string;
}

function InsurancesList({ className = '', teacher, student, studentNameFromUrl }: Props): React.ReactElement<Props> {
  const MAX_SELECTED = 10000;
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const [studentName, setStudentName] = useState<string | undefined>(studentNameFromUrl);

  // Initialize startDate and endDate
  const [startDate, setStartDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(INSURANCES, 'start');
    return stored ? new Date(stored) : new Date(new Date().setHours(0, 0, 0, 0));
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(INSURANCES, 'end');
    return stored ? new Date(stored) : new Date(new Date().setHours(23, 59, 59, 999));
  });

  const [isSelectionAllowed, setSelectionAllowed] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Insurance[]>([]);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();

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
    fetchStudentName();
  }, [student, studentNameFromUrl]);

  const insurances = useLiveQuery(
    () => getInsurances(teacher, student, startDate.getTime(), endDate.getTime()),
    [teacher, student, startDate, endDate]
  );



  const handleSelectionChange = (newSelectedItems: Badge[]) => {
    const insurances = newSelectedItems as Insurance[];
    if (newSelectedItems.length > MAX_SELECTED) {
      showInfo(`${t('You can select no more than:')} ${MAX_SELECTED}`);
      return;
    }
    setSelectedItems(insurances);
  };

  const handleSelectionToggle = useCallback((checked: boolean): void => {
    setSelectionAllowed(checked);
  }, []);

  const deleteItems = async () => {
    const idsToDelete = selectedItems.map((insurance: Insurance) => insurance.workerSign);
    try {
      for (const id of idsToDelete) {
        if (id) {
          await deleteInsurance(id);
        }
      }
      showInfo(t('Deleted'));
      setSelectedItems([]);
    } catch (error) {
      console.error('Error deleting selected items:', error);
      showInfo(t('Deletion failed'));
    } finally {
      toggleDeleteConfirm();
    }
  };

  const deleteSelectedButton =
    selectedItems.length > 0 && (
      <Button icon="trash" label={t('Delete')} onClick={toggleDeleteConfirm} />
    );

  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>
        {studentName + ', ' + t('badges')}:
      </h2>
      <div className="ui--row">
        <DaysRangePicker
          startDate={startDate ? new Date(startDate) : null}
          endDate={endDate ? new Date(endDate) : null}
          sessionStorageId={INSURANCES}
          onChange={(start: Date, end: Date) => {
            if (start) {
              setStartDate(start);
              saveToSessionStorage(INSURANCES, 'start', start.toISOString());
            }
            if (end) {
              setEndDate(end);
              saveToSessionStorage(INSURANCES, 'end', end.toISOString());
            }
          }}
        />
      </div>
      <ToggleContainer>
        <Toggle
          label={t('Select')}
          onChange={handleSelectionToggle}
          value={isSelectionAllowed}
        />
      </ToggleContainer>
      <SelectableList<Badge>
        items={insurances}
        renderItem={(insurance, isSelected, isSelectionAllowed, onToggleSelection) => (
          <BadgeInfo
            badge={insurance}
            isSelected={isSelected}
            onToggleSelection={onToggleSelection}
            isSelectionAllowed={isSelectionAllowed}
          />
        )}
        onSelectionChange={handleSelectionChange}
        maxSelectableItems={MAX_SELECTED}
        additionalControls={deleteSelectedButton}
        keyExtractor={(insurance) => (insurance as Insurance).workerSign}
        key={student}
        isSelectionAllowed={isSelectionAllowed}
      />
      {isDeleteConfirmOpen && (
        <Confirmation question={t('Are you sure you want to delete it?')} onClose={toggleDeleteConfirm} onConfirm={deleteItems}/>
      )}
    </div>
  );
}
export default React.memo(InsurancesList);