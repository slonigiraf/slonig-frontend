// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react'
import { styled, Icon, Button, Modal, Toggle } from '@polkadot/react-components';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from '../translate.js';
import { deleteInsurance, Badge, getInsurances, getPseudonym, Insurance } from '@slonigiraf/db';
import { DateInput, SelectableList, ToggleContainer, useInfo } from '@slonigiraf/app-slonig-components';
import { useToggle } from '@polkadot/react-hooks';
import BadgeInfo from './BadgeInfo.js';

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

  // Initialize startDate and endDate as timestamps
  const [startDate, setStartDate] = useState<number | null>(new Date(new Date().setHours(0, 0, 0, 0)).getTime());
  const [endDate, setEndDate] = useState<number | null>(new Date(new Date().setHours(23, 59, 59, 999)).getTime());
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
    () => getInsurances(teacher, student, startDate, endDate),
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

  const startDateId = 'insurances:start';
  const endDateId = 'insurances:end';

  if (!insurances) return <div></div>;

  return (
    <div>
      <h2>
        {studentName + ', ' + t('badges')}:
      </h2>
      <div className="ui--row">
        <div>
          <DateInput
            date={startDate ? new Date(startDate) : null}
            onDateChange={(date) => setStartDate(date ? date.getTime() : null)}
            id={startDateId}
            sessionStorageId={startDateId}
            label={t('Dates of receipt')}
          />
          <StyledIcon icon="arrow-right" />
          <DateInput
            date={endDate ? new Date(endDate) : null}
            onDateChange={(date) => setEndDate(date ? date.getTime() : null)}
            id={endDateId}
          />
        </div>
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
        <StyledModal
          header={t('Are you sure you want to delete it?')}
          onClose={toggleDeleteConfirm}
          size="small"
        >
          <Modal.Content>
            <StyledDiv>
              <Button icon="check" label={t('Yes')} onClick={deleteItems} />
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
export default React.memo(InsurancesList);