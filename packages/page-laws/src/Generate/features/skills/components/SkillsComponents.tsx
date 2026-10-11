// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { formatChapterTitle } from '../../../book/domain/chapters/chapterTitles.js';
import type { BookChapter, Skill } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';
import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';
import type { ConceptRedoStage } from '../conceptRedoStages.js';

import { deleteAbilities, deleteAbility, deleteSkill, getImage, putImage, storeAbility, updateBookChapterTitle } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React, { useCallback, useState } from 'react';

import { Button, Dropdown, Input, Modal } from '@polkadot/react-components';

import ExerciseList from '../../../../Edit/ExerciseList.js';
import { isTikzCode } from '../../../../Edit/tikz.js';
import { nextStoredTikzValidity } from '../../../../Edit/tikzValidation.js';
import { parseStoredAbility, withAbilityVisualSource } from '../../../../abilities/abilities.js';
import { abilityModuleId, storedAbilityImageId } from '../../../book/application/abilities/abilityProcessing.js';
import { EditForm } from '../SkillsStyles.js';
import { CONCEPT_REDO_STAGES } from '../conceptRedoStages.js';
import FixingOverlay from '../../../shared/ui/FixingOverlay.js';
import ItemActionsMenu from '../../../shared/ui/ItemActionsMenu.js';

const TikzDisplay = React.lazy(() => import('../../../../Edit/TikzDisplay.js'));

export function ChapterNavigation ({ chapters, failedVisualCounts, index, matchAbilities = false, missingAbilityCounts, onChange, onEdit }: { chapters: BookChapter[]; failedVisualCounts?: number[]; index: number; matchAbilities?: boolean; missingAbilityCounts?: number[]; onChange: (index: number) => void; onEdit: () => void }): React.ReactElement | null {
  const previous = useCallback((): void => onChange(index - 1), [index, onChange]);
  const next = useCallback((): void => onChange(index + 1), [index, onChange]);

  if (!chapters.length) {
    return null;
  }

  if (matchAbilities) {
    return <div className='chapterNavigation exercisesChapterNavigation'>
      <Button
        icon='arrow-left'
        isDisabled={index <= 0}
        onClick={previous}
      />
      <div className='chapterSelectGroup'>
        <label>Chapter <select
          aria-label='Navigate chapters'
          onChange={({ target }) => onChange(Number(target.value))}
          value={index}
                       >
          {chapters.map(({ id, title }, chapterIndex) => {
            const missingCount = missingAbilityCounts?.[chapterIndex] ?? 0;

            return <option
              key={id ?? `${title}:${chapterIndex}`}
              value={chapterIndex}
            >{title || 'Chapter not identified'}{missingCount ? ` (${missingCount} exercise${missingCount === 1 ? '' : 's'} missing abilities)` : ''}{failedVisualCounts?.[chapterIndex] ? ` (${failedVisualCounts[chapterIndex]} TikZ issue${failedVisualCounts[chapterIndex] === 1 ? '' : 's'})` : ''}</option>;
          })}
        </select></label>
        <Button
          aria-label='Edit chapter name'
          icon='edit'
          isDisabled={chapters[index]?.id === undefined}
          onClick={onEdit}
        />
      </div>
      <span>{index + 1} of {chapters.length}</span>
      <Button
        icon='arrow-right'
        isDisabled={index >= chapters.length - 1}
        onClick={next}
      />
    </div>;
  }

  return <div className='chapterNavigation'>
    <Button
      icon='arrow-left'
      isDisabled={index <= 0}
      onClick={previous}
    />
    <Dropdown
      onChange={onChange}
      options={chapters.map(({ id, title }, chapterIndex) => ({ key: id ?? chapterIndex, text: title, value: chapterIndex }))}
      value={index}
    />
    <Button
      aria-label='Edit chapter name'
      icon='edit'
      isDisabled={chapters[index]?.id === undefined}
      onClick={onEdit}
    />
    <input
      aria-label='Navigate chapters'
      max={Math.max(1, chapters.length - 1)}
      min={0}
      onChange={({ target }) => onChange(Number(target.value))}
      type='range'
      value={index}
    />
    <span>{index + 1} / {chapters.length}</span>
    <Button
      icon='arrow-right'
      isDisabled={index >= chapters.length - 1}
      onClick={next}
    />
  </div>;
}

export function ChapterTitleEditor ({ chapter, language, onClose, onError, onSaved }: { chapter: BookChapter; language?: string; onClose: () => void; onError: (error: string) => void; onSaved: () => void }): React.ReactElement {
  const [title, setTitle] = useState(chapter.title);
  const save = useCallback((): void => {
    if (chapter.id === undefined || !title.trim()) {
      return;
    }

    updateBookChapterTitle(chapter.id, formatChapterTitle(title, language))
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to rename the chapter.'));
  }, [chapter.id, language, onClose, onError, onSaved, title]);

  return <Modal
    header='Edit chapter name'
    onClose={onClose}
    size='small'
  >
    <Modal.Content>
      <div className='chapterEditor'>
        <Input
          label='Chapter name'
          onChange={setTitle}
          onEnter={save}
          value={title}
        />
        <Button.Group>
          <Button
            icon='times'
            label='Cancel'
            onClick={onClose}
          />
          <Button
            icon='save'
            isDisabled={!title.trim() || title.trim() === chapter.title}
            label='Save'
            onClick={save}
          />
        </Button.Group>
      </div>
    </Modal.Content>
  </Modal>;
}

export function BookItem ({ description, id, onDelete, onDeleted, onError, title }: { description: string; id?: number; onDelete: (id: number) => Promise<void>; onDeleted: () => void; onError: (message: string) => void; title: string; type?: 'concept' }): React.ReactElement {
  const remove = useCallback((): void => {
    if (id === undefined) return;
    onDelete(id).then(onDeleted).catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'Unable to delete the Concept.'));
  }, [id, onDelete, onDeleted, onError]);

  return <article className='contentCard' tabIndex={-1}>
    <div className='contentCardActions'>
      <ItemActionsMenu actions={[{ label: 'Delete', isDestructive: true, isDisabled: id === undefined, onClick: remove }]} label='Concept' />
    </div>
    <strong><SpanWithTags content={title} /></strong>
    {description && <p><SpanWithTags content={description} /></p>}
  </article>;
}

export function SkillCard ({ bookId, onDeleted, onError, skill }: { bookId: number; onDeleted: () => void; onError: (message: string) => void; skill: Skill }): React.ReactElement {
  const remove = useCallback((): void => {
    if (skill.id === undefined) {
      return;
    }

    Promise.all([deleteSkill(skill.id), deleteAbilities(abilityModuleId(bookId, skill.id))]).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the Skill.'));
  }, [bookId, onDeleted, onError, skill.id]);

  return <article className='contentCard' tabIndex={-1}>
    <div className='contentCardActions'>
      <Button icon='trash' onClick={remove} />
    </div>
    <strong><SpanWithTags content={skill.title} /></strong>
    {skill.description && <p><SpanWithTags content={skill.description} /></p>}
  </article>;
}

function cloneAbility (ability: GeneratedAbility): GeneratedAbility {
  return { ...ability, q: ability.q.map((exercise) => ({ ...exercise })) };
}

export function AbilityCard ({ isBusy = false, onDeleted, onError, onFix, onSplit, record, visualIssues }: { isBusy?: boolean; onDeleted: () => void; onError: (message: string) => void; onFix: (record: StoredAbility, stage: ConceptRedoStage) => Promise<void>; onSplit: (record: StoredAbility) => Promise<void>; record: StoredAbility; visualIssues?: Record<string, string[]> }): React.ReactElement {
  const [isRedoDialogOpen, setIsRedoDialogOpen] = useState(false);
  const [redoStart, setRedoStart] = useState<ConceptRedoStage>('exercises');
  const [isEditing, setIsEditing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<GeneratedAbility | null>(() => record.ability ? cloneAbility(record.ability) : null);
  const [rawDraft, setRawDraft] = useState(record.content);
  const remove = useCallback((): void => {
    deleteAbility(record.id).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the Ability.'));
  }, [onDeleted, onError, record.id]);
  const persistAbility = useCallback(async (ability: GeneratedAbility): Promise<void> => {
    const validated = parseStoredAbility(JSON.stringify(ability));
    const newRecordId = await storeAbility(record.moduleId, JSON.stringify(validated), record.displayOrder);

    if (newRecordId !== record.id) {
      await deleteAbility(record.id);
    }

    onDeleted();
  }, [onDeleted, record.id, record.moduleId]);
  const saveVisual = useCallback(async (exerciseIndex: number, field: 'p' | 'i', value: string): Promise<void> => {
    if (!record.ability) {
      throw new Error('Unable to save TikZ for invalid Ability JSON.');
    }

    const imageId = storedAbilityImageId(record, exerciseIndex, field);
    const image = imageId === undefined ? undefined : await getImage(imageId);
    const exercise = record.ability.q[exerciseIndex];

    if (!image || !exercise) {
      throw new Error('Unable to find the Image referenced by this Ability visual.');
    }

    const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
    const tikz = isTikzCode(value);
    const prompt = exercise[promptField]?.trim() || (tikz ? image.prompt : value.trim());

    await putImage({ ...image, data: tikz ? value : null, prompt, type: tikz ? 'tikz' : 'prompt', valid: undefined });
    onDeleted();
  }, [onDeleted, record]);
  const saveVisualError = useCallback(async (exerciseIndex: number, field: 'p' | 'i', hasError: boolean, renderedValue: string): Promise<void> => {
    if (!record.ability) {
      throw new Error('Unable to save TikZ error state for invalid Ability JSON.');
    }

    const exercise = record.ability.q[exerciseIndex];

    if (!exercise) {
      return;
    }

    const imageId = storedAbilityImageId(record, exerciseIndex, field);
    const image = imageId === undefined ? undefined : await getImage(imageId);

    if (!image) {
      throw new Error('Unable to find the Image referenced by this Ability visual.');
    }

    const nextValid = nextStoredTikzValidity(image.data, image.valid, renderedValue, hasError);

    if (nextValid !== undefined) {
      await putImage({ ...image, valid: nextValid });
      onDeleted();
    }
  }, [onDeleted, record]);
  const openEdit = useCallback((): void => {
    setDraft(record.ability ? cloneAbility(record.ability) : null);
    setRawDraft(record.content);
    setIsEditing(true);
  }, [record.ability, record.content]);
  const closeEdit = useCallback((): void => {
    if (!isSaving) {
      setIsEditing(false);
    }
  }, [isSaving]);
  const updateDraftExercise = useCallback((exerciseIndex: number, field: 'a' | 'h' | 'i' | 'iPrompt' | 'p' | 'pPrompt', value: string): void => {
    setDraft((current) => current
      ? { ...current, q: current.q.map((exercise, index) => index === exerciseIndex ? (field === 'p' || field === 'i' ? withAbilityVisualSource(exercise, field, value) : { ...exercise, [field]: value }) : exercise) }
      : current);
  }, []);
  const save = useCallback((): void => {
    setIsSaving(true);

    Promise.resolve()
      .then(() => {
        const nextAbility = draft
          ? {
            ...draft,
            h: draft.h.trim(),
            q: draft.q.map((exercise) => ({ ...exercise, a: exercise.a.trim(), h: exercise.h.trim() }))
          }
          : parseStoredAbility(rawDraft);

        return persistAbility(nextAbility);
      })
      .then(() => setIsEditing(false))
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to save the Ability.'))
      .finally(() => setIsSaving(false));
  }, [draft, onError, persistAbility, rawDraft]);

  const fix = useCallback((): void => {
    setIsRedoDialogOpen(false);
    setIsFixing(true);
    onFix(record, redoStart)
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to regenerate this Concept with AI.'))
      .finally(() => setIsFixing(false));
  }, [onError, onFix, record, redoStart]);

  const split = useCallback((): void => {
    setIsSplitting(true);
    onSplit(record)
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to split this Concept with AI.'))
      .finally(() => setIsSplitting(false));
  }, [onError, onSplit, record]);

  const isProcessing = isFixing || isSplitting;
  const hasLinkedConcept = /-concept-\d+$/.test(record.moduleId);

  return <article aria-busy={isProcessing} className={`contentCard abilityCard${record.ability?.q.length === 1 ? ' abilityCardSingleExercise' : ''}`} tabIndex={-1}>
    <div className='contentCardActions'>
      <ItemActionsMenu
        actions={[
          { label: isFixing ? 'Regenerating…' : 'Fix with AI', isDisabled: isBusy || isProcessing || isSaving, onClick: () => setIsRedoDialogOpen(true) },
          { label: isSplitting ? 'Splitting…' : 'Split', isDisabled: !hasLinkedConcept || isBusy || isProcessing || isSaving || isEditing, onClick: split },
          { label: 'Edit', isDisabled: isBusy || isProcessing, onClick: openEdit },
          { label: 'Delete', isDestructive: true, isDisabled: isBusy || isProcessing || isSaving, onClick: remove }
        ]}
        label='Ability'
      />
    </div>
    {record.ability
      ? <>
        <ExerciseList
          areShownInitially
          exercises={record.ability.q}
          location='ability_info'
          onAbilityVisualErrorChange={saveVisualError}
          onAbilityVisualSave={saveVisual}
          visualIssues={visualIssues}
        />
      </>
      : <>
        <strong>Invalid Ability JSON</strong>
        <p>This record can be repaired with Fix abilities.</p>
      </>}
    {isProcessing && <FixingOverlay label={isSplitting ? 'Splitting Concept with AI' : 'Fixing with AI'} />}
    {isRedoDialogOpen && <Modal
      header='Redo this Concept with AI'
      onClose={() => setIsRedoDialogOpen(false)}
      size='small'
    >
      <Modal.Content>
        <div className='chapterEditor'>
          <p>Choose where to restart. The selected stage and every subsequent stage will run again for this Concept only. Other Concepts will not be changed.</p>
          <Dropdown
            isFull
            label='Start from'
            onChange={setRedoStart}
            options={CONCEPT_REDO_STAGES.map(({ key, label }) => ({ key, text: label, value: key }))}
            value={redoStart}
          />
          <p><small>Results are replaced as each stage succeeds. Earlier stages are kept, and an interrupted run may leave this Concept partially regenerated.</small></p>
          <Button.Group>
            <Button icon='play' label='Run' onClick={fix} />
          </Button.Group>
        </div>
      </Modal.Content>
    </Modal>}
    {isEditing && <Modal
      header='Edit Ability'
      onClose={closeEdit}
      size='small'
    >
      <Modal.Content>
        <EditForm>
          {draft
            ? <>
              <label>
                <span>Ability name</span>
                <input
                  disabled={isSaving}
                  onChange={({ target }) => setDraft((current) => current ? { ...current, h: target.value } : current)}
                  type='text'
                  value={draft.h}
                />
              </label>
              {draft.q.map((exercise, exerciseIndex) => <fieldset key={exerciseIndex}>
                <legend>Exercise {exerciseIndex + 1}</legend>
                <label>
                  <span>Question</span>
                  <textarea
                    disabled={isSaving}
                    onChange={({ target }) => updateDraftExercise(exerciseIndex, 'h', target.value)}
                    rows={4}
                    value={exercise.h}
                  />
                </label>
                <label>
                  <span>Question visual value</span>
                  <textarea
                    disabled={isSaving}
                    onChange={({ target }) => updateDraftExercise(exerciseIndex, 'p', target.value)}
                    rows={4}
                    value={exercise.p}
                  />
                </label>
                <label>
                  <span>Question visual prompt</span>
                  <textarea
                    disabled={isSaving}
                    onChange={({ target }) => updateDraftExercise(exerciseIndex, 'pPrompt', target.value)}
                    rows={3}
                    value={exercise.pPrompt ?? ''}
                  />
                </label>
                <label>
                  <span>Answer</span>
                  <textarea
                    disabled={isSaving}
                    onChange={({ target }) => updateDraftExercise(exerciseIndex, 'a', target.value)}
                    rows={4}
                    value={exercise.a}
                  />
                </label>
                <label>
                  <span>Answer visual value</span>
                  <textarea
                    disabled={isSaving}
                    onChange={({ target }) => updateDraftExercise(exerciseIndex, 'i', target.value)}
                    rows={4}
                    value={exercise.i}
                  />
                </label>
                <label>
                  <span>Answer visual prompt</span>
                  <textarea
                    disabled={isSaving}
                    onChange={({ target }) => updateDraftExercise(exerciseIndex, 'iPrompt', target.value)}
                    rows={3}
                    value={exercise.iPrompt ?? ''}
                  />
                </label>
              </fieldset>)}
            </>
            : <label>
              <span>Ability JSON</span>
              <textarea
                disabled={isSaving}
                onChange={({ target }) => setRawDraft(target.value)}
                rows={18}
                value={rawDraft}
              />
            </label>}
          <div className='editActions'>
            <Button
              icon='times'
              isDisabled={isSaving}
              label='Cancel'
              onClick={closeEdit}
            />
            <Button
              icon='save'
              isDisabled={isSaving || (draft ? !draft.h.trim() || draft.q.some(({ a, h }) => !a.trim() || !h.trim()) : !rawDraft.trim())}
              label={isSaving ? 'Saving…' : 'Save'}
              onClick={save}
            />
          </div>
        </EditForm>
      </Modal.Content>
    </Modal>}
  </article>;
}

export function AbilityReviewCard ({ ability, content, isProposed = false }: { ability: GeneratedAbility | null; content?: string; isProposed?: boolean }): React.ReactElement {
  return <div className={`fixResultsReviewCard${isProposed ? ' isProposed' : ''}`}>
    <div className='fixResultsReviewHeading'>
      <strong>{ability ? <SpanWithTags content={ability.h} /> : 'Invalid Ability JSON'}</strong>
      {isProposed && <span className='fixResultsReviewMeta'><span className='fixResultsReviewProposed'>Proposed</span></span>}
    </div>
    {ability
      ? <ExerciseList
        areShownInitially
        exercises={ability.q}
        location='ability_info'
      />
      : <pre>{content}</pre>}
  </div>;
}

export function RemovedReviewCard ({ label }: { label: string }): React.ReactElement {
  return <div className='fixResultsReviewRemoved'>{label}</div>;
}
