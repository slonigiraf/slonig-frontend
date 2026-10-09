// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter, Exercise } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React from 'react';
import type { ChapterContent, SkillsView } from '../SkillsTypes.js';
import type { ExerciseEditableFields } from '../../../shared/types/exercise.js';
import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';
import type { ConceptRedoStage } from '../conceptRedoStages.js';

import { stripMarkdownImageReferences } from '../../../book/infrastructure/pdf/bookImageRefs.js';
import { exerciseAbilityModuleId } from '../../../book/application/abilities/abilityProcessing.js';
import { AbilityCard, BookItem, ChapterNavigation, SkillCard } from './SkillsComponents.js';
import { groupAbilitiesByConcept, indexSourceExercisesByModuleId } from './abilityConceptGroups.js';

interface SkillsContentViewProps {
  abilitiesOutputRef: React.Ref<HTMLDivElement>;
  allExercises: Exercise[];
  bookId: number;
  chapterContentOutputRef: React.Ref<HTMLDivElement>;
  chapterIndex: number;
  chapters: BookChapter[];
  changeChapter: (index: number) => void;
  current?: ChapterContent;
  currentMissingAbilityIndexes: number[];
  deleteConceptWithExercises: (conceptId: number) => Promise<void>;
  deleteExerciseWithAbilities: (exerciseId: number) => Promise<void>;
  fixSingleAbility: (record: StoredAbility, stage: ConceptRedoStage) => Promise<void>;
  fixSingleExercise: (exerciseId: number) => Promise<void>;
  isBusy: boolean;
  focusAbilityExercise: (exerciseIndex: number) => void;
  missingAbilityCountsByChapter: number[];
  onError: (message: string) => void;
  openChapterEditor: () => void;
  pipelineOnly: boolean;
  refresh: () => void;
  refreshContent: () => void;
  saveExercise: (exerciseId: number, value: ExerciseEditableFields) => Promise<void>;
  view: SkillsView;
}

export default function SkillsContentView ({ abilitiesOutputRef, allExercises, bookId, chapterContentOutputRef, chapterIndex, chapters, changeChapter, current, currentMissingAbilityIndexes, deleteConceptWithExercises, deleteExerciseWithAbilities, fixSingleAbility, fixSingleExercise, focusAbilityExercise, isBusy, missingAbilityCountsByChapter, onError, openChapterEditor, pipelineOnly, refresh, refreshContent, saveExercise, view }: SkillsContentViewProps): React.ReactElement {
  const abilityGroups = current
    ? groupAbilitiesByConcept(current.concepts, current.exercises, current.abilities, (id) => exerciseAbilityModuleId(bookId, id))
    : undefined;
  const sourceExercises = React.useMemo(() => indexSourceExercisesByModuleId(allExercises, (id) => exerciseAbilityModuleId(bookId, id)), [allExercises, bookId]);
  const conceptIds = new Set(current?.concepts.flatMap(({ id }) => id === undefined ? [] : [id]) ?? []);
  const hasExercisesWithoutConcept = current?.exercises.some(({ conceptId }) => conceptId === undefined || !conceptIds.has(conceptId)) ?? false;

  return <>
  {!pipelineOnly && <>
    <ChapterNavigation
      chapters={chapters}
      index={chapterIndex}
      matchExercises={view === 'preExercisesExercises'}
      missingAbilityCounts={view === 'preExercisesExercises' ? missingAbilityCountsByChapter : undefined}
      onChange={changeChapter}
      onEdit={openChapterEditor}
    />
    {!current && <p>No chapters have been generated for this book.</p>}
    {current && (
      <>
        {view === 'conceptsSkills' && (
          <div
            className='columns'
            ref={chapterContentOutputRef}
          >
            <section>
              <h3>Book concepts and exercises</h3>
              {!current.concepts.length && !current.exercises.length && <p>No concepts or exercises in this chapter.</p>}
              {current.concepts.map((concept) => (
                <BookItem
                  description={concept.description}
                  id={concept.id}
                  key={`concept-${concept.id ?? 'new'}`}
                  onDelete={deleteConceptWithExercises}
                  onDeleted={refresh}
                  onError={onError}
                  title={concept.title}
                  type='concept'
                />
              ))}
              {current.exercises.map((exercise) => (
                <BookItem
                  description={stripMarkdownImageReferences(exercise.description)}
                  id={exercise.id}
                  imageDescription={exercise.imageDescription}
                  key={`exercise-${exercise.id ?? 'new'}`}
                  onDelete={deleteExerciseWithAbilities}
                  onDeleted={refresh}
                  onError={onError}
                  onFix={fixSingleExercise}
                  onSave={saveExercise}
                  solution={exercise.solution}
                  solutionImageDescription={exercise.solutionImageDescription}
                  title={exercise.title}
                  type='exercise'
                />
              ))}
            </section>
            <section>
              <h3>Skills</h3>
              {!current.skills.length && <p>No Skills generated.</p>}
              {current.skills.map((skill) => <SkillCard
                bookId={bookId}
                key={skill.id}
                onDeleted={refresh}
                onError={onError}
                skill={skill}
                                             />)}
            </section>
          </div>
        )}
        {view === 'preExercisesExercises' && (
          <div
            className='singlePane abilitiesPane'
            ref={abilitiesOutputRef}
          >
            <h3>Concepts and Abilities</h3>
            {!current.concepts.length && <p>No Concepts in this chapter.</p>}
            {!!currentMissingAbilityIndexes.length && <div className='missingAbilityNavigation'>
              <span>Missing Abilities for Exercises:</span>
              <span className='missingAbilityLinks'>{currentMissingAbilityIndexes.map((exerciseIndex, missingIndex) => <React.Fragment key={current.exercises[exerciseIndex].id ?? `exercise-${exerciseIndex}`}>
                {missingIndex > 0 && <span aria-hidden='true'>, </span>}
                <button
                  aria-label={`Go to Exercise ${exerciseIndex + 1}, missing an Ability`}
                  onClick={() => focusAbilityExercise(exerciseIndex)}
                  type='button'
                >{exerciseIndex + 1}</button>
              </React.Fragment>)}</span>
            </div>}
            {abilityGroups?.groups.map(({ abilities, concept }, conceptIndex) => <section
              className={`abilityExerciseCard abilityConceptCard${abilities.length > 0 && abilities.every(({ ability }) => ability?.q.length === 1) ? ' abilityConceptCardSingleExercise' : ''}`}
              data-concept-id={concept.id}
              data-concept-rank={conceptIndex + 1}
              key={`concept-${concept.id ?? conceptIndex}`}
              tabIndex={-1}
            >
              <h4><span>{conceptIndex + 1}. </span><SpanWithTags content={concept.title} /></h4>
              {concept.description && <p><SpanWithTags content={concept.description} /></p>}
              <div className='matchedAbilities'>
                {abilities.length
                  ? abilities.map((record) => <AbilityCard isBusy={isBusy} key={record.id} sourceExercise={sourceExercises.get(record.moduleId)} onDeleted={refreshContent} onError={onError} onFix={fixSingleAbility} record={record} />)
                  : <p className='noAbility'>No Ability generated for this Concept.</p>}
              </div>
            </section>)}
            {(hasExercisesWithoutConcept || !!abilityGroups?.withoutConcept.length) && <section className='unmatchedAbilities orphanAbilities' tabIndex={-1}>
              <h4>Abilities without a linked Concept</h4>
              {abilityGroups?.withoutConcept.length
                ? abilityGroups.withoutConcept.map((record) => <AbilityCard isBusy={isBusy} key={record.id} sourceExercise={sourceExercises.get(record.moduleId)} onDeleted={refreshContent} onError={onError} onFix={fixSingleAbility} record={record} />)
                : <p className='noAbility'>No Abilities generated for exercises without a linked Concept.</p>}
            </section>}
            {!!abilityGroups?.unmatched.length && <section className='unmatchedAbilities' tabIndex={-1}>
              <h4>Unmatched Abilities</h4>
              {abilityGroups.unmatched.map((record) => <AbilityCard isBusy={isBusy} key={record.id} sourceExercise={sourceExercises.get(record.moduleId)} onDeleted={refreshContent} onError={onError} onFix={fixSingleAbility} record={record} />)}
            </section>}
          </div>
        )}
      </>
    )}
  </>}
  </>;
}
