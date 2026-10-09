// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ExerciseFixReviewResult, FixReviewResult, ImageFixReviewResult } from '../SkillsTypes.js';

import { SpanWithTags } from '@slonigiraf/slonig-components';
import React from 'react';

import { Button, Modal } from '@polkadot/react-components';

import { AbilityReviewCard, ExerciseReviewCard, RemovedReviewCard } from './SkillsComponents.js';
import { FixResultsReviewContent } from '../SkillsStyles.js';

const TikzDisplay = React.lazy(() => import('../../../../Edit/TikzDisplay.js'));

interface SkillsReviewModalsProps {
  applyAbilityFixReview: () => Promise<void>;
  applyExerciseFixReview: () => Promise<void>;
  applyImageFixReview: () => Promise<void>;
  autoRunAll: boolean;
  closeExerciseFixReview: () => void;
  closeFixReview: () => void;
  closeImageFixReview: () => void;
  exerciseFixReview: ExerciseFixReviewResult | null;
  fixReview: FixReviewResult | null;
  imageFixReview: ImageFixReviewResult | null;
  isBusy: boolean;
}

export default function SkillsReviewModals ({ applyAbilityFixReview, applyExerciseFixReview, applyImageFixReview, autoRunAll, closeExerciseFixReview, closeFixReview, closeImageFixReview, exerciseFixReview, fixReview, imageFixReview, isBusy }: SkillsReviewModalsProps): React.ReactElement {
  return <>
  {exerciseFixReview && !autoRunAll && (
    <Modal
      header='Fix exercises results'
      onClose={closeExerciseFixReview}
      size='large'
    >
      <Modal.Content>
        <FixResultsReviewContent>
          <div className='fixResultsReviewIntro'>
            <p><strong>No Exercise changes have been saved yet.</strong></p>
            <p>Checked {exerciseFixReview.checked} Exercises. Proposed {exerciseFixReview.items.length} correction{exerciseFixReview.items.length === 1 ? '' : 's'} and {exerciseFixReview.duplicatePairs.length} duplicate deletion{exerciseFixReview.duplicatePairs.length === 1 ? '' : 's'}.</p>
          </div>
          {(exerciseFixReview.items.length > 0 || exerciseFixReview.duplicatePairs.length > 0) && <div className='fixResultsReviewComparison'>
            {exerciseFixReview.items.map(({ errors, exercise, exerciseId, original }, index) => <article
              className='fixResultsReviewItem'
              key={exerciseId}
            >
              <strong>{index + 1}. <SpanWithTags content={original.title} /></strong>
              <div className='fixResultsReviewRow'>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>Before</span>
                  <ExerciseReviewCard exercise={original} />
                </div>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>After</span>
                  <ExerciseReviewCard
                    exercise={exercise}
                    isProposed
                  />
                </div>
              </div>
              <section className='fixResultsDifference'>
                <h3>Difference</h3>
                {errors.length
                  ? <ul>{errors.map((message, errorIndex) => <li key={`${exerciseId}-${errorIndex}`}><SpanWithTags content={message} /></li>)}</ul>
                  : <p>This Exercise will be replaced by the proposed correction shown above.</p>}
              </section>
            </article>)}
            {exerciseFixReview.duplicatePairs.map(({ chapterTitle, deleted, kept }, duplicateIndex) => <article
              className='fixResultsReviewItem'
              key={deleted.id ?? `deleted-${duplicateIndex}`}
            >
              <strong>{exerciseFixReview.items.length + duplicateIndex + 1}. <SpanWithTags content={deleted.title} /> — duplicate deletion</strong>
              <p className='fixResultsReviewContext'><small>Chapter: <SpanWithTags content={chapterTitle} /> · Keeping: <SpanWithTags content={kept.title} /></small></p>
              <div className='fixResultsReviewRow'>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>Before</span>
                  <ExerciseReviewCard exercise={deleted} />
                </div>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>After</span>
                  <RemovedReviewCard label='Removed as duplicate' />
                </div>
              </div>
              <section className='fixResultsDifference'>
                <h3>Difference</h3>
                <p><strong><SpanWithTags content={deleted.title} /></strong> will be deleted as a duplicate; <SpanWithTags content={kept.title} /> will be kept.</p>
              </section>
            </article>)}
          </div>}
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isBusy}
              label='Discard'
              onClick={closeExerciseFixReview}
            />
            <Button
              icon='check'
              isDisabled={isBusy}
              label={exerciseFixReview.items.length || exerciseFixReview.duplicatePairs.length ? 'Apply changes' : 'Confirm review'}
              onClick={() => applyExerciseFixReview().catch(console.error)}
            />
          </Button.Group>
        </FixResultsReviewContent>
      </Modal.Content>
    </Modal>
  )}
  {fixReview && !autoRunAll && (
    <Modal
      header='Fix abilities results'
      onClose={closeFixReview}
      size='large'
    >
      <Modal.Content>
        <FixResultsReviewContent>
          <div className='fixResultsReviewIntro'>
            <p><strong>No Ability changes have been saved yet.</strong></p>
            <p>Checked {fixReview.checked} Abilities. Proposed {fixReview.items.length} correction{fixReview.items.length === 1 ? '' : 's'} and {fixReview.duplicatePairs.length} duplicate deletion{fixReview.duplicatePairs.length === 1 ? '' : 's'}. A duplicate deletion also removes its source Exercise and linked Concept.</p>
            {fixReview.unresolved.length > 0 && <p><strong>{fixReview.unresolved.length} unresolved {fixReview.unresolved.length === 1 ? 'Ability' : 'Abilities'}:</strong> the AI reported errors but did not produce a valid change. These records will remain unchanged and this stage will not be marked complete. Visual-only issues belong in Fix images.</p>}
          </div>
          {(fixReview.items.length > 0 || fixReview.duplicatePairs.length > 0 || fixReview.unresolved.length > 0) && <div className='fixResultsReviewComparison'>
            {fixReview.items.map(({ ability, errors, exerciseTitle, record, recordId }, index) => <article
              className='fixResultsReviewItem'
              key={recordId}
            >
              <strong>{index + 1}. {record.ability ? <SpanWithTags content={record.ability.h} /> : <SpanWithTags content={ability.h} />}</strong>
              {exerciseTitle && <p className='fixResultsReviewContext'><small>Exercise: <SpanWithTags content={exerciseTitle} /></small></p>}
              <div className='fixResultsReviewRow'>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>Before</span>
                  <AbilityReviewCard
                    ability={record.ability}
                    content={record.content}
                  />
                </div>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>After</span>
                  <AbilityReviewCard
                    ability={ability}
                    isProposed
                  />
                </div>
              </div>
              <section className='fixResultsDifference'>
                <h3>Difference</h3>
                {errors.length
                  ? <ul>{errors.map((message, errorIndex) => <li key={`${recordId}-${errorIndex}`}><SpanWithTags content={message} /></li>)}</ul>
                  : <p>This Ability will be replaced by the proposed correction shown above.</p>}
              </section>
            </article>)}
            {fixReview.unresolved.map(({ errors, record }) => <article className='fixResultsReviewItem' key={`unresolved-${record.id}`}>
              <strong>{record.ability ? <SpanWithTags content={record.ability.h} /> : 'Invalid Ability JSON'} — unresolved</strong>
              <p>No corrected text was supplied. The stored Ability will not be changed.</p>
              <ul>{errors.map((message, index) => <li key={`${record.id}-unresolved-${index}`}><SpanWithTags content={message} /></li>)}</ul>
            </article>)}
            {fixReview.duplicatePairs.map(({ chapterTitle, deleted, deletedConceptTitle, deletedExerciseTitle, keptExerciseTitle }, duplicateIndex) => <article
              className='fixResultsReviewItem'
              key={deleted.id}
            >
              <strong>{fixReview.items.length + duplicateIndex + 1}. {deleted.ability ? <SpanWithTags content={deleted.ability.h} /> : 'Invalid Ability JSON'} — duplicate deletion</strong>
              <p className='fixResultsReviewContext'><small>Chapter: <SpanWithTags content={chapterTitle} />{deletedExerciseTitle && <> · Exercise: <SpanWithTags content={deletedExerciseTitle} /></>}{deletedConceptTitle && <> · Concept: <SpanWithTags content={deletedConceptTitle} /></>}{keptExerciseTitle && <> · Keeping Ability for: <SpanWithTags content={keptExerciseTitle} /></>}</small></p>
              <div className='fixResultsReviewRow'>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>Before</span>
                  <AbilityReviewCard
                    ability={deleted.ability}
                    content={deleted.content}
                  />
                </div>
                <div className='fixResultsReviewCell'>
                  <span className='fixResultsReviewChangeLabel'>After</span>
                  <RemovedReviewCard label='Removed as duplicate with its source Exercise and linked Concept' />
                </div>
              </div>
              <section className='fixResultsDifference'>
                <h3>Difference</h3>
                <p>{deleted.ability ? <strong><SpanWithTags content={deleted.ability.h} /></strong> : <strong>Invalid Ability JSON</strong>} will be deleted as a duplicate{deletedExerciseTitle ? <> together with source Exercise <SpanWithTags content={deletedExerciseTitle} /></> : null}{deletedConceptTitle ? <> and linked Concept <SpanWithTags content={deletedConceptTitle} /></> : null}{keptExerciseTitle ? <>; the Ability for <SpanWithTags content={keptExerciseTitle} /> will be kept</> : null}.</p>
              </section>
            </article>)}
          </div>}
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isBusy}
              label='Discard'
              onClick={closeFixReview}
            />
            <Button
              icon='check'
              isDisabled={isBusy || (fixReview.unresolved.length > 0 && fixReview.items.length === 0 && fixReview.duplicatePairs.length === 0)}
              label={fixReview.items.length || fixReview.duplicatePairs.length ? 'Apply available changes' : fixReview.unresolved.length ? 'No applicable fixes' : 'Confirm review'}
              onClick={() => applyAbilityFixReview().catch(console.error)}
            />
          </Button.Group>
        </FixResultsReviewContent>
      </Modal.Content>
    </Modal>
  )}
  {imageFixReview && !autoRunAll && (
    <Modal
      header='Fix images results'
      onClose={closeImageFixReview}
      size='large'
    >
      <Modal.Content>
        <FixResultsReviewContent>
          <div className='fixResultsReviewIntro'>
            <p><strong>No TikZ source changes have been saved yet.</strong></p>
            <p>Checked {imageFixReview.checked} TikZ visual{imageFixReview.checked === 1 ? '' : 's'}. The pre-render found {imageFixReview.renderFailures} original render failure{imageFixReview.renderFailures === 1 ? '' : 's'}, and AI proposed {imageFixReview.items.length} correction{imageFixReview.items.length === 1 ? '' : 's'}. Render failures are saved as validation metadata.</p>
          </div>
          {imageFixReview.items.length > 0 && <div className='fixResultsReviewComparison'>
            {imageFixReview.items.map(({ errors, exerciseIndex, field, fixedPreRender, fixedTikz, originalPreRender, originalTikz, prompt, record }, index) => {
              const exercise = record.ability?.q[exerciseIndex];
              const role = field === 'p' ? 'Question' : 'Solution';

              return <article
                className='fixResultsReviewItem'
                key={`${record.id}-${exerciseIndex}-${field}`}
              >
                <strong>{index + 1}. {record.ability?.h ? <SpanWithTags content={record.ability.h} /> : 'Ability'} — exercise {exerciseIndex + 1} {role.toLowerCase()} visual</strong>
                {exercise && <p className='fixResultsReviewContext'><small>Exercise: <SpanWithTags content={exercise.h} /></small></p>}
                {prompt && <p className='fixResultsReviewContext'><small>Original visual prompt: <SpanWithTags content={prompt} /></small></p>}
                <div className='fixResultsReviewRow'>
                  <div className='fixResultsReviewCell'>
                    <span className='fixResultsReviewChangeLabel'>Before</span>
                    <div className='fixResultsReviewCard'>
                      <div className='fixResultsReviewHeading'>
                        <strong>{role} visual</strong>
                      </div>
                      <p><small>Pre-render: {originalPreRender.compiled ? 'rendered successfully' : 'FAILED to render'}</small></p>
                      {!originalPreRender.compiled && originalPreRender.diagnostics.length > 0 && <pre className='tikzDiagnostics'>{originalPreRender.diagnostics.slice(-8).join('\n')}</pre>}
                      <pre className='tikzCodeDiff'>{originalTikz}</pre>
                      {originalPreRender.compiled && <React.Suspense fallback={<small>Loading TikZ renderer…</small>}><TikzDisplay alt={`Original ${role} visual`} value={originalTikz} /></React.Suspense>}
                    </div>
                  </div>
                  <div className='fixResultsReviewCell'>
                    <span className='fixResultsReviewChangeLabel'>After</span>
                    <div className='fixResultsReviewCard isProposed'>
                      <div className='fixResultsReviewHeading'>
                        <strong>{role} visual</strong>
                        <span className='fixResultsReviewMeta'>
                          <span className='fixResultsReviewProposed'>Proposed</span>
                        </span>
                      </div>
                      <p><small>Pre-render: {fixedPreRender.compiled ? 'rendered successfully' : 'FAILED'}</small></p>
                      {!fixedPreRender.compiled && fixedPreRender.diagnostics.length > 0 && <pre className='tikzDiagnostics'>{fixedPreRender.diagnostics.slice(-8).join('\n')}</pre>}
                      <pre className='tikzCodeDiff'>{fixedTikz}</pre>
                      <React.Suspense fallback={<small>Loading TikZ renderer…</small>}><TikzDisplay alt={`Corrected ${role} visual`} value={fixedTikz} /></React.Suspense>
                    </div>
                  </div>
                </div>
                <section className='fixResultsDifference'>
                  <h3>Difference</h3>
                  {errors.length
                    ? <ul>{errors.map((message, errorIndex) => <li key={`${record.id}-${exerciseIndex}-${field}-${errorIndex}`}><SpanWithTags content={message} /></li>)}</ul>
                    : <p>The {role.toLowerCase()} TikZ source will be replaced by the proposed correction shown above.</p>}
                </section>
              </article>;
            })}
          </div>}
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isBusy}
              label='Discard'
              onClick={closeImageFixReview}
            />
            <Button
              icon='check'
              isDisabled={isBusy}
              label={imageFixReview.items.length ? 'Apply changes' : 'Confirm review'}
              onClick={() => applyImageFixReview().catch(console.error)}
            />
          </Button.Group>
        </FixResultsReviewContent>
      </Modal.Content>
    </Modal>
  )}
  </>;
}
