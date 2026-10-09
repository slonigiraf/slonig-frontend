// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React, { useCallback, useState } from 'react';

import { Button, Modal } from '@polkadot/react-components';

import { stripMarkdownImageReferences } from '../../../../book/infrastructure/pdf/bookImageRefs.js';
import { useTranslation } from '../../../../../common/translate.js';
import type { ExerciseEditableFields } from '../../../../shared/types/exercise.js';
import FixingOverlay from '../../../../shared/ui/FixingOverlay.js';
import { ExerciseEditForm, ExerciseItemContainer } from './EditableExerciseItem.styles.js';

function EditableExerciseItem ({ exercise, onError, onFix, onSave }: { exercise: Exercise; onError: (message: string) => void; onFix: (exercise: Exercise) => Promise<void>; onSave: (exerciseId: number, value: ExerciseEditableFields) => Promise<void> }): React.ReactElement {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState(exercise.title);
  const [draftDescription, setDraftDescription] = useState(stripMarkdownImageReferences(exercise.description));
  const [draftImageDescription, setDraftImageDescription] = useState(exercise.imageDescription ?? '');
  const [draftSolution, setDraftSolution] = useState(exercise.solution ?? '');
  const [draftSolutionImageDescription, setDraftSolutionImageDescription] = useState(exercise.solutionImageDescription ?? '');
  const n_a = t('N/A');

  const openEdit = useCallback((): void => {
    setDraftTitle(exercise.title);
    setDraftDescription(stripMarkdownImageReferences(exercise.description));
    setDraftImageDescription(exercise.imageDescription ?? '');
    setDraftSolution(exercise.solution ?? '');
    setDraftSolutionImageDescription(exercise.solutionImageDescription ?? '');
    setIsEditing(true);
  }, [exercise.description, exercise.imageDescription, exercise.solution, exercise.solutionImageDescription, exercise.title]);
  const closeEdit = useCallback((): void => {
    if (!isSaving) {
      setIsEditing(false);
    }
  }, [isSaving]);
  const save = useCallback((): void => {
    if (exercise.id === undefined || !draftTitle.trim()) {
      return;
    }

    setIsSaving(true);
    onSave(exercise.id, {
      description: draftDescription.trim(),
      imageDescription: draftImageDescription.trim(),
      solution: draftSolution.trim(),
      solutionImageDescription: draftSolutionImageDescription.trim(),
      title: draftTitle.trim()
    })
      .then(() => setIsEditing(false))
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to save the Exercise.'))
      .finally(() => setIsSaving(false));
  }, [draftDescription, draftImageDescription, draftSolution, draftSolutionImageDescription, draftTitle, exercise.id, onError, onSave]);

  const fix = useCallback((): void => {
    setIsFixing(true);
    onFix(exercise)
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to fix the Exercise with AI.'))
      .finally(() => setIsFixing(false));
  }, [exercise, onError, onFix]);
  const description = stripMarkdownImageReferences(exercise.description);

  return <ExerciseItemContainer aria-busy={isFixing} className='exerciseItem'>
    <div className='exerciseItemActions'>
      <Button
        icon='robot'
        isDisabled={exercise.id === undefined || isFixing || isSaving}
        label={isFixing ? 'Fixing…' : 'Fix with AI'}
        onClick={fix}
      />
      <Button
        icon='edit'
        isDisabled={exercise.id === undefined || isFixing}
        label='Edit'
        onClick={openEdit}
      />
    </div>
    <p><b>{t('Question:')} </b>{description ? <SpanWithTags content={description} /> : n_a}</p>
    <p><b>{t('Question image:')} </b>{exercise.imageDescription ? <SpanWithTags content={exercise.imageDescription} /> : n_a}</p>
    <p><b>{t('Solution:')} </b>{exercise.solution ? <SpanWithTags content={exercise.solution} /> : n_a}</p>
    <p><b>{t('Answer image:')} </b>{exercise.solutionImageDescription ? <SpanWithTags content={exercise.solutionImageDescription} /> : n_a}</p>
    {isFixing && <FixingOverlay />}
    {isEditing && <Modal
      header='Edit Exercise'
      onClose={closeEdit}
      size='small'
    >
      <Modal.Content>
        <ExerciseEditForm>
          <label>
            <span>Title</span>
            <input
              disabled={isSaving}
              onChange={({ target }) => setDraftTitle(target.value)}
              type='text'
              value={draftTitle}
            />
          </label>
          <label>
            <span>Task</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftDescription(target.value)}
              rows={5}
              value={draftDescription}
            />
          </label>
          <label>
            <span>Required visual description</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftImageDescription(target.value)}
              rows={3}
              value={draftImageDescription}
            />
          </label>
          <label>
            <span>Solution</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftSolution(target.value)}
              rows={5}
              value={draftSolution}
            />
          </label>
          <label>
            <span>Solution visual description</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftSolutionImageDescription(target.value)}
              rows={3}
              value={draftSolutionImageDescription}
            />
          </label>
          <div className='exerciseEditActions'>
            <Button
              icon='times'
              isDisabled={isSaving}
              label='Cancel'
              onClick={closeEdit}
            />
            <Button
              icon='save'
              isDisabled={isSaving || !draftTitle.trim()}
              label={isSaving ? 'Saving…' : 'Save'}
              onClick={save}
            />
          </div>
        </ExerciseEditForm>
      </Modal.Content>
    </Modal>}
  </ExerciseItemContainer>;
}

export default EditableExerciseItem;
