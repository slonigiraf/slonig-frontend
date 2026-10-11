// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React from 'react';
import type { ChapterContent, SkillsView } from '../SkillsTypes.js';
import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';
import type { ConceptRedoStage } from '../conceptRedoStages.js';

import { conceptAbilityModuleId, storedAbilityImageId } from '../../../book/application/abilities/abilityProcessing.js';
import { AbilityCard, BookItem, ChapterNavigation, SkillCard } from './SkillsComponents.js';
import { groupAbilitiesByConcept } from './abilityConceptGroups.js';

interface SkillsContentViewProps {
  abilitiesOutputRef: React.Ref<HTMLDivElement>;
  bookId: number;
  chapterContentOutputRef: React.Ref<HTMLDivElement>;
  chapterIndex: number;
  chapters: BookChapter[];
  changeChapter: (index: number) => void;
  current?: ChapterContent;
  currentMissingAbilityIndexes: number[];
  deleteConceptAndAbilities: (conceptId: number) => Promise<void>;
  fixSingleAbility: (record: StoredAbility, stage: ConceptRedoStage) => Promise<void>;
  splitSingleAbility: (record: StoredAbility) => void;
  splitQueueConceptIds: readonly number[];
  isBusy: boolean;
  focusConceptAbility: (exerciseIndex: number) => void;
  failedVisualCountsByChapter: number[];
  missingAbilityCountsByChapter: number[];
  onError: (message: string) => void;
  openChapterEditor: () => void;
  pipelineOnly: boolean;
  refresh: () => void;
  refreshContent: () => void;
  view: SkillsView;
  tikzIssuesByImageId: Record<number, string[]>;
}

export default function SkillsContentView ({ abilitiesOutputRef, bookId, chapterContentOutputRef, chapterIndex, chapters, changeChapter, current, currentMissingAbilityIndexes, deleteConceptAndAbilities, fixSingleAbility, splitSingleAbility, splitQueueConceptIds, focusConceptAbility, failedVisualCountsByChapter, isBusy, missingAbilityCountsByChapter, onError, openChapterEditor, pipelineOnly, refresh, refreshContent, tikzIssuesByImageId, view }: SkillsContentViewProps): React.ReactElement {
  const abilityGroups = current
    ? groupAbilitiesByConcept(current.concepts, current.abilities, (id) => conceptAbilityModuleId(bookId, id))
    : undefined;
  const visualIssuesFor = (record: StoredAbility): Record<string, string[]> => {
    const result: Record<string, string[]> = {};

    record.ability?.q.forEach((_, exerciseIndex) => {
      (['p', 'i'] as const).forEach((field) => {
        const imageId = storedAbilityImageId(record, exerciseIndex, field);

        if (imageId !== undefined && tikzIssuesByImageId[imageId]?.length) {
          result[`${exerciseIndex}-${field}`] = tikzIssuesByImageId[imageId];
        }
      });
    });

    return result;
  };
  const hasVisualIssue = (record: StoredAbility): boolean => Object.keys(visualIssuesFor(record)).length > 0;
  const failedConceptIndexes = abilityGroups?.groups.flatMap(({ abilities }, index) => abilities.some(hasVisualIssue) ? [index] : []) ?? [];

  return <>
  {!pipelineOnly && <>
    <ChapterNavigation
      chapters={chapters}
      failedVisualCounts={failedVisualCountsByChapter}
      index={chapterIndex}
      matchAbilities={view === 'preExercisesExercises'}
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
              <h3>Book concepts</h3>
              {!current.concepts.length && <p>No concepts in this chapter.</p>}
              {current.concepts.map((concept) => (
                <BookItem
                  description={concept.description}
                  id={concept.id}
                  key={`concept-${concept.id ?? 'new'}`}
                  onDelete={deleteConceptAndAbilities}
                  onDeleted={refresh}
                  onError={onError}
                  title={concept.title}
                  type='concept'
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
              <span>Missing Abilities for Concepts:</span>
              <span className='missingAbilityLinks'>{currentMissingAbilityIndexes.map((exerciseIndex, missingIndex) => <React.Fragment key={current.concepts[exerciseIndex].id ?? `concept-${exerciseIndex}`}>
                {missingIndex > 0 && <span aria-hidden='true'>, </span>}
                <button
                  aria-label={`Go to Concept ${exerciseIndex + 1}, missing an Ability`}
                  onClick={() => focusConceptAbility(exerciseIndex)}
                  type='button'
                >{exerciseIndex + 1}</button>
              </React.Fragment>)}</span>
            </div>}
            {!!failedConceptIndexes.length && <div className='missingAbilityNavigation tikzIssueNavigation'>
              <span>Abilities with failed TikZ visuals:</span>
              <span className='missingAbilityLinks'>{failedConceptIndexes.map((conceptIndex, index) => <React.Fragment key={conceptIndex}>
                {index > 0 && <span aria-hidden='true'>, </span>}
                <button
                  aria-label={`Go to Ability ${conceptIndex + 1} with a failed TikZ visual`}
                  onClick={() => focusConceptAbility(conceptIndex)}
                  type='button'
                >{conceptIndex + 1}</button>
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
                  ? abilities.map((record) => <AbilityCard isBusy={isBusy} isQueuedForSplit={splitQueueConceptIds.includes(Number(/-concept-(\d+)$/.exec(record.moduleId)?.[1]))} key={record.id} onDeleted={refreshContent} onError={onError} onFix={fixSingleAbility} onSplit={splitSingleAbility} record={record} visualIssues={visualIssuesFor(record)} />)
                  : <p className='noAbility'>No Ability generated for this Concept.</p>}
              </div>
            </section>)}
            {!!abilityGroups?.unmatched.length && <section className='unmatchedAbilities' tabIndex={-1}>
              <h4>Unmatched Abilities</h4>
              {abilityGroups.unmatched.map((record) => <AbilityCard isBusy={isBusy} isQueuedForSplit={splitQueueConceptIds.includes(Number(/-concept-(\d+)$/.exec(record.moduleId)?.[1]))} key={record.id} onDeleted={refreshContent} onError={onError} onFix={fixSingleAbility} onSplit={splitSingleAbility} record={record} visualIssues={visualIssuesFor(record)} />)}
            </section>}
          </div>
        )}
      </>
    )}
  </>}
  </>;
}
