// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { formatChapterTitle } from '../../../book/domain/chapters/chapterTitles.js';
import type { AbilityFixInstructions, BookChapter, Skill } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';
import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';

import { ABILITY_FIX_FIELDS, emptyAbilityFixInstructions, effectiveAbilityFixInstructions, deleteAbilities, deleteAbilityWithConcept, deleteSkill, getBookAbilityWorkQueue, getImage, putImage, replaceAbility, updateBookChapterTitle } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React, { useCallback, useState } from 'react';

import { Button, Dropdown, Input, Modal } from '@polkadot/react-components';

import ExerciseList from '../../../../Edit/ExerciseList.js';
import { isTikzCode } from '../../../../Edit/tikz.js';
import { nextStoredTikzValidity } from '../../../../Edit/tikzValidation.js';
import { parseStoredAbility, withAbilityVisualSource } from '../../../../abilities/abilities.js';
import { abilityModuleId, storedAbilityImageId } from '../../../book/application/abilities/abilityProcessing.js';
import { EditForm } from '../SkillsStyles.js';
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
            >{title || 'Chapter not identified'}{missingCount ? ` (${missingCount} exercise${missingCount === 1 ? '' : 's'} missing abilities)` : ''}{failedVisualCounts?.[chapterIndex] ? ` (${failedVisualCounts[chapterIndex]} image issue${failedVisualCounts[chapterIndex] === 1 ? '' : 's'})` : ''}</option>;
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

export function AbilityCard ({ isBusy = false, queuedFixItemId, isQueuedForSplit = false, onDeleted, onError, onQueueFix, onCancelFix, onSplit, record, visualIssues }: { isBusy?: boolean; queuedFixItemId?: string; isQueuedForSplit?: boolean; onDeleted: () => void; onError: (message: string) => void; onQueueFix?: (record: StoredAbility, instructions: AbilityFixInstructions) => Promise<void>; onCancelFix?: (itemId: string) => Promise<void>; onSplit: (record: StoredAbility) => void; record: StoredAbility; visualIssues?: Record<string, string[]> }): React.ReactElement {
  const [isFixDialogOpen, setIsFixDialogOpen] = useState(false);
  const [showDetailedFixForm, setShowDetailedFixForm] = useState(false);
  const [fixInstructions, setFixInstructions] = useState<AbilityFixInstructions>(emptyAbilityFixInstructions);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isCancellingFix, setIsCancellingFix] = useState(false);
  const isQueuedForFix = queuedFixItemId !== undefined;
  const [isEditing, setIsEditing] = useState(false);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<GeneratedAbility | null>(() => record.ability ? cloneAbility(record.ability) : null);
  const [rawDraft, setRawDraft] = useState(record.content);
  const remove = useCallback((): void => {
    deleteAbilityWithConcept(record.id).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the Ability and its Concept.'));
  }, [onDeleted, onError, record.id]);
  const persistAbility = useCallback(async (ability: GeneratedAbility): Promise<void> => {
    const validated = parseStoredAbility(JSON.stringify(ability));
    await replaceAbility(record.id, JSON.stringify(validated));

    // Manual edits do not enter the AI-fix log. Still relink any earlier AI
    // correction when the edited Ability receives a new content-based ID.
    onDeleted();
  }, [onDeleted, record.id, record.moduleId]);
  const saveVisual = useCallback(async (exerciseIndex: number, field: 'p' | 'i', value: string): Promise<void> => {
    if (!record.ability) {
      throw new Error('Unable to save image for invalid Ability JSON.');
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
      throw new Error('Unable to save image error state for invalid Ability JSON.');
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
    setEditingExerciseIndex(null);
    setIsEditing(true);
  }, [record.ability, record.content]);
  const openExerciseEdit = useCallback((exerciseIndex: number): void => {
    if (!record.ability?.q[exerciseIndex]) return;

    setDraft(cloneAbility(record.ability));
    setEditingExerciseIndex(exerciseIndex);
    setIsEditing(true);
  }, [record.ability]);
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
            h: editingExerciseIndex === null ? draft.h.trim() : draft.h,
            q: draft.q.map((exercise, index) => editingExerciseIndex === null || index === editingExerciseIndex
              ? { ...exercise, a: exercise.a.trim(), h: exercise.h.trim() }
              : exercise)
          }
          : parseStoredAbility(rawDraft);

        return persistAbility(nextAbility);
      })
      .then(() => setIsEditing(false))
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to save the Ability.'))
      .finally(() => setIsSaving(false));
  }, [draft, editingExerciseIndex, onError, persistAbility, rawDraft]);

  const openFix = useCallback(async (): Promise<void> => {
    const bookMatch = /^book-(\d+)-concept-\d+$/.exec(record.moduleId);
    const queued = isQueuedForFix && bookMatch
      ? (await getBookAbilityWorkQueue(Number(bookMatch[1]))).find((item) => item.kind === 'fix' && item.id === queuedFixItemId)?.instructions
      : undefined;
    const instructions = { ...emptyAbilityFixInstructions(), ...queued };

    if (!queued) {
      await Promise.all((record.ability?.q ?? []).slice(0, 2).flatMap((_, index) => (['p', 'i'] as const).map(async (field) => {
        const key = `${index}-${field}`;
        const imageId = storedAbilityImageId(record, index, field);
        const image = imageId === undefined ? undefined : await getImage(imageId);
        const errors = [...new Set([...(image?.detectedIssues ?? []), ...(image?.reviewResult?.errors ?? []), ...(visualIssues?.[key] ?? [])])];
        if (record.ability?.q[index]?.[field === 'p' ? 'pError' : 'iError'] || image?.valid === false) {
          errors.push(`${field === 'p' ? 'Question' : 'Answer'} image is marked as incorrect; regenerate and recheck it.`);
        }
        if (errors.length) {
          const instructionKey = `exercise${index + 1}${field === 'p' ? 'QuestionImage' : 'AnswerImage'}` as (typeof ABILITY_FIX_FIELDS)[number]['key'];
          instructions[instructionKey] = errors.join('\n');
        }
      })));
    }

    setFixInstructions(instructions);
    setShowDetailedFixForm(false);
    setIsFixDialogOpen(true);
  }, [isQueuedForFix, queuedFixItemId, record, visualIssues]);

  const scheduleFix = useCallback(async (): Promise<void> => {
    if (!onQueueFix) return;
    setIsScheduling(true);
    try {
      await onQueueFix(record, effectiveAbilityFixInstructions(fixInstructions));
      setIsFixDialogOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to schedule Ability correction.');
    } finally {
      setIsScheduling(false);
    }
  }, [fixInstructions, onError, onQueueFix, record]);

  const cancelFix = useCallback(async (): Promise<void> => {
    if (!queuedFixItemId || !onCancelFix) return;
    setIsCancellingFix(true);
    try {
      await onCancelFix(queuedFixItemId);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to cancel the scheduled Ability correction.');
    } finally {
      setIsCancellingFix(false);
    }
  }, [onCancelFix, onError, queuedFixItemId]);

  const split = useCallback((): void => {
    try {
      onSplit(record);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to queue this Ability for splitting.');
    }
  }, [onError, onSplit, record]);

  const isProcessing = isScheduling || isCancellingFix;
  const hasLinkedConcept = /-concept-\d+$/.test(record.moduleId);

  return <article aria-busy={isProcessing} className={`contentCard abilityCard${isQueuedForFix ? ' abilityCardQueuedForFix' : ''}${record.ability?.q.length === 1 ? ' abilityCardSingleExercise' : ''}`} tabIndex={-1}>
    <div className='contentCardActions'>
      <ItemActionsMenu
        actions={[
          { label: isQueuedForFix ? 'Edit scheduled Fix Ability' : 'Fix Ability', isDisabled: !onQueueFix || isBusy || isProcessing || isSaving, onClick: () => { void openFix().catch((error: unknown) => onError(error instanceof Error ? error.message : String(error))); } },
          ...(isQueuedForFix ? [{ label: 'Cancel fixing', isDisabled: !onCancelFix || isBusy || isProcessing || isSaving, onClick: () => { void cancelFix(); } }] : []),
          { label: isQueuedForSplit ? 'Remove from split queue' : 'Split', isDisabled: !hasLinkedConcept || isBusy || isProcessing || isSaving || isEditing, onClick: split },
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
          isExerciseEditDisabled={isBusy || isProcessing || isSaving || isEditing}
          location='ability_info'
          onEditExercise={openExerciseEdit}
          onAbilityVisualErrorChange={saveVisualError}
          onAbilityVisualSave={saveVisual}
          visualIssues={visualIssues}
        />
      </>
      : <>
        <strong>Invalid Ability JSON</strong>
        <p>This record can be repaired with Fix abilities.</p>
      </>}
    {isProcessing && <FixingOverlay label={isCancellingFix ? 'Cancelling scheduled correction' : 'Scheduling Ability correction'} />}
    {isFixDialogOpen && <Modal
      header='Fix Ability'
      onClose={() => { if (!isScheduling) setIsFixDialogOpen(false); }}
      size={showDetailedFixForm ? 'large' : 'small'}
    >
      <Modal.Content>
        <EditForm>
          {!showDetailedFixForm
            ? <>
              <label>
                <span>What should be changed in this Ability?</span>
                <textarea
                  aria-label='Whole Ability correction instructions'
                  disabled={isScheduling}
                  onChange={({ target }) => setFixInstructions((current) => ({ ...current, overall: target.value }))}
                  placeholder='Optional — leave blank to regenerate both exercises'
                  rows={3}
                  value={fixInstructions.overall}
                />
              </label>
              <p>Comments are optional. Fix Ability regenerates both exercises, creates new question images, checks them, then builds and checks answer images FROM the updated question figures (9 baseline AI requests). A written whole-Ability instruction replaces detailed notes.</p>
            </>
            : <>
              {fixInstructions.overall.trim()
                ? <p className='noticeMessage'>The whole-Ability instruction takes priority. These detailed notes will be ignored unless you clear it in the short form.</p>
                : <p>Describe specific text changes for a targeted fix. Leave text fields empty for full regeneration of both exercises and their question/answer images. Detected visual issues are included automatically.</p>}
              {ABILITY_FIX_FIELDS.filter(({ key }) => !key.startsWith('exercise2') || (record.ability?.q.length ?? 2) > 1).map(({ key, label, image }) => <label key={key}>
                <span>{label}</span>
                <textarea
                  aria-label={`${label} correction instructions`}
                  disabled={isScheduling}
                  onChange={({ target }) => setFixInstructions((current) => ({ ...current, [key]: target.value }))}
                  placeholder={image ? 'Describe how to correct or regenerate this image' : 'Describe the text changes to make'}
                  rows={image ? 3 : 2}
                  value={fixInstructions[key]}
                />
              </label>)}
            </>}
          <Button
            icon={showDetailedFixForm ? 'arrow-left' : 'edit'}
            isDisabled={isScheduling}
            label={showDetailedFixForm ? 'Use short form' : 'Show detailed form'}
            onClick={() => setShowDetailedFixForm((current) => !current)}
          />
          <Button.Group>
            <Button icon='times' isDisabled={isScheduling} label='Cancel' onClick={() => setIsFixDialogOpen(false)} />
            <Button icon='calendar-plus' isDisabled={!onQueueFix || isScheduling} label={isScheduling ? 'Scheduling…' : 'Schedule'} onClick={() => { void scheduleFix(); }} />
          </Button.Group>
        </EditForm>
      </Modal.Content>
    </Modal>}
    {isEditing && <Modal
      header={editingExerciseIndex === null ? 'Edit Ability' : `Edit exercise ${editingExerciseIndex + 1}`}
      onClose={closeEdit}
      size='small'
    >
      <Modal.Content>
        <EditForm>
          {draft
            ? <>
              {editingExerciseIndex === null && <label>
                <span>Ability name</span>
                <input
                  disabled={isSaving}
                  onChange={({ target }) => setDraft((current) => current ? { ...current, h: target.value } : current)}
                  type='text'
                  value={draft.h}
                />
              </label>}
              {draft.q.map((exercise, exerciseIndex) => (editingExerciseIndex === null || editingExerciseIndex === exerciseIndex) && <fieldset key={exerciseIndex}>
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
