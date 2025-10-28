import LessonInfo from './LessonInfo.js';
import React, { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Toggle } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Confirmation, DaysRangePicker, loadFromSessionStorage, saveToSessionStorage, SelectableList, ToggleContainer, useInfo } from '@slonigiraf/slonig-components';
import { useToggle } from '@polkadot/react-hooks';
import { deleteLesson, getLessons, Lesson } from '@slonigiraf/db';
import { LESSONS } from '../constants.js';

interface Props {
  className?: string;
  tutor: string;
  onResumeTutoring: (lesson: Lesson) => void;
  onShowResults: (lesson: Lesson) => void;
}

function LessonsList({ className = '', tutor, onResumeTutoring, onShowResults }: Props): React.ReactElement<Props> {
  const MAX_SELECTED = 93;
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const [isSelectionAllowed, setSelectionAllowed] = useState(false);

  // Initialize startDate and endDate
  const [startDate, setStartDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(LESSONS, 'start');
    return stored ? new Date(stored) : new Date(new Date().setHours(0, 0, 0, 0));
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(LESSONS, 'end');
    return stored ? new Date(stored) : new Date(new Date().setHours(23, 59, 59, 999));
  });
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();

  const lessons = useLiveQuery<Lesson[]>(
    () => getLessons(tutor, startDate.getTime(), endDate.getTime()),
    [tutor, startDate, endDate]
  );

  const [selectedItems, setSelectedLessons] = useState<Lesson[]>([]);

  const handleSelectionChange = (newSelectedLessons: Lesson[]) => {
    if (newSelectedLessons.length > MAX_SELECTED) {
      showInfo(`${t('You can select no more than:')} ${MAX_SELECTED}`);
      return;
    }
    setSelectedLessons(newSelectedLessons);
  };

  const handleSelectionToggle = useCallback((checked: boolean): void => {
    setSelectionAllowed(checked);
  }, []);

  const deleteItems = async () => {
    const idsToDelete = selectedItems.map((lesson) => lesson.id);
    try {
      for (const id of idsToDelete) {
        if (id) {
          await deleteLesson(id);
        }
      }
      showInfo(t('Deleted'));
      setSelectedLessons([]);
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

  return !lessons ? (
    <div></div>
  ) : (
    <div>
      <h2>{t('My lessons')}</h2>
      <div className="ui--row">
        <DaysRangePicker
          startDate={startDate ? new Date(startDate) : null}
          endDate={endDate ? new Date(endDate) : null}
          sessionStorageId={LESSONS}
          onChange={(start: Date, end: Date) => {
            if (start) {
              setStartDate(start);
              saveToSessionStorage(LESSONS, 'start', start.toISOString());
            }
            if (end) {
              setEndDate(end);
              saveToSessionStorage(LESSONS, 'end', end.toISOString());
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
      <SelectableList<Lesson>
        items={lessons}
        renderItem={(lesson, isSelected, isSelectionAllowed, onToggleSelection) => (
          <LessonInfo
            lesson={lesson}
            isSelected={isSelected}
            onToggleSelection={onToggleSelection}
            onResumeTutoring={onResumeTutoring}
            onShowResults={onShowResults}
            isSelectionAllowed={isSelectionAllowed}
          />
        )}
        onSelectionChange={handleSelectionChange}
        maxSelectableItems={MAX_SELECTED}
        additionalControls={deleteSelectedButton}
        keyExtractor={(lesson) => lesson.id}
        key={tutor}
        isSelectionAllowed={isSelectionAllowed}
      />
      {isDeleteConfirmOpen && (
        <Confirmation question={t('Are you sure you want to delete it?')} onClose={toggleDeleteConfirm} onConfirm={deleteItems}/>
      )}
    </div>
  );
}

export default React.memo(LessonsList);