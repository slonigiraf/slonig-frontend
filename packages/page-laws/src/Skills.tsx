// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, Exercise, Skill } from '@slonigiraf/db';
import type { GeneratedAbility } from './abilities.js';
import type { AbilityBlueprint, AtomicAbilityConversion, AbilityWorkflowJsonRunner } from './abilityWorkflow.js';

import { deleteAbilities, deleteAbility, deleteBookConcept, deleteExercise, deleteSkill, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, getSkillsForChapter, replaceAbilities, replaceExercisesForBookPage, replaceSkillsForChapter, SettingKey, storeAbility, updateBookChapterTitle, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { parseAbilityRepairResult, parseStoredAbility } from './abilities.js';
import { parseExerciseRepairResult } from './exercises.js';
import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT, FIX_ABILITIES_REQUEST_PROMPT, FIX_EXERCISES_REQUEST_PROMPT, JSON_VALIDATION_PROMPT, OPENAI_MODELS, REPAIR_SYSTEM_PROMPT, SKILLS_GENERATION_SYSTEM_PROMPT, SOURCES_TO_SKILLS_REQUEST_PROMPT } from './constants.js';
import { abilityBlueprintRequestPrompt, materializeAtomicAbilityExercise, planAtomicAbilityExercise, transportCompactAbilitySourceExercise } from './abilityWorkflow.js';
import { mapConcurrent } from './concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from './openRouterConcurrency.js';
import { generateOpenRouterVisual } from './openRouterImages.js';
import { stripMarkdownImageReferences } from './bookImageRefs.js';
import { batchItemsByChapter } from './chapterBatching.js';

const BATCH_SIZE = 5;
const ABILITIES_STAGE = 7;
const FIX_ABILITIES_STAGE = 8;
const MAX_REQUEST_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1_000;
const AI_REQUEST_TIMEOUT_MS = 60_000;
const ABILITY_GENERATION_CONCURRENCY = 5;
const VISUAL_MATERIALIZATION_CONCURRENCY = 3;
const VISUALS_PER_EXERCISE_CONCURRENCY = 2;
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getErrorStatus (error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === 'number' ? status : undefined;
}

function getRetryAfterMs (error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('headers' in error)) {
    return undefined;
  }

  const headers = (error as { headers?: unknown }).headers;
  let retryAfter: unknown;

  if (typeof headers === 'object' && headers !== null && 'get' in headers && typeof (headers as { get?: unknown }).get === 'function') {
    retryAfter = (headers as { get: (name: string) => unknown }).get('retry-after');
  } else if (typeof headers === 'object' && headers !== null) {
    const record = headers as Record<string, unknown>;

    retryAfter = record['retry-after'] ?? record['Retry-After'];
  }

  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
    return Math.max(0, retryAfter * 1_000);
  }

  if (typeof retryAfter !== 'string' || !retryAfter.trim()) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(retryAfter);

  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isRetryableRequestError (error: unknown): boolean {
  const status = getErrorStatus(error);

  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

async function requestChatContent (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, jsonObject: boolean, maxOutputTokens?: number): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
    try {
      const makeRequest = () => client.chat.completions.create({
        messages: [{ content: systemPrompt, role: 'system' as const }, { content: userPrompt, role: 'user' as const }],
        model,
        ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
        ...(jsonObject ? { response_format: { type: 'json_object' as const } } : {})
      }, { timeout: AI_REQUEST_TIMEOUT_MS });
      const response = await openRouterRequestGate.run(makeRequest);

      return response.choices[0].message?.content?.trim() ?? '';
    } catch (error) {
      lastError = error;

      if (!isRetryableRequestError(error) || attempt === MAX_REQUEST_ATTEMPTS - 1) {
        throw error;
      }

      const retryAfter = getRetryAfterMs(error);
      const backoff = retryAfter ?? RETRY_BASE_DELAY_MS * (2 ** attempt);

      openRouterRequestGate.pause(backoff);
      await delay(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed after retries.');
}

export type SkillsView = 'conceptsSkills' | 'preExercisesExercises';

interface Props {
  book: Book;
  onBookChange: (book: Book) => void;
  onAction?: (view: SkillsView | 'conceptExercises') => void;
  onEntityCountsChange?: (counts: { abilities: number; bookExercises: number; exercises: number }) => void;
  pipelineOnly?: boolean;
  pipelinePrefix?: React.ReactNode;
  showPipeline?: boolean;
  view: SkillsView;
}

interface StoredAbility {
  ability: GeneratedAbility | null;
  content: string;
  id: string;
  moduleId: string;
}

interface FixedAbilityReview {
  ability: GeneratedAbility;
  errors: string[];
  exerciseTitle?: string;
  record: StoredAbility;
  recordId: string;
}

interface DuplicateAbilityReview {
  chapterTitle: string;
  deleted: StoredAbility;
  deletedExerciseTitle?: string;
  kept: StoredAbility;
  keptExerciseTitle?: string;
}

interface FixReviewResult {
  checked: number;
  duplicatePairs: DuplicateAbilityReview[];
  items: FixedAbilityReview[];
}

interface FixedExerciseReview {
  errors: string[];
  exercise: Exercise;
  exerciseId: number;
}

interface DuplicateExerciseReview {
  chapterTitle: string;
  deleted: Exercise;
  kept: Exercise;
}

interface ExerciseFixReviewResult {
  checked: number;
  duplicatePairs: DuplicateExerciseReview[];
  items: FixedExerciseReview[];
}

interface BookPageContent {
  exercises: Exercise[];
  page: BookPage;
}

interface ChapterContent {
  chapter: BookChapter;
  concepts: BookConcept[];
  exercises: Exercise[];
  abilities: StoredAbility[];
  skills: Skill[];
}

interface SkillSource {
  chapterId: number;
  chapterTitle: string;
  description: string;
  sourceId: number;
  sourceType: 'concept' | 'exercise';
  title: string;
}

type AiAction = 'exercises' | 'fix' | 'fixExercises' | 'skills';

const abilityModuleId = (bookId: number, skillId: number): string => `book-${bookId}-skill-${skillId}`;
const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

function parseJson (content: string): unknown {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

function parseGeneratedSkills (content: string, expectedCount: number): Array<{ description: string; title: string }> {
  const parsed = parseJson(content);
  const values = Array.isArray(parsed) ? parsed : (parsed as { skills?: unknown })?.skills;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid book skill data.');
  }

  const skills = values as Array<Partial<Skill>>;

  if (skills.length !== expectedCount || skills.some(({ description, title }) => typeof title !== 'string' || !title.trim() || typeof description !== 'string')) {
    throw new Error(`OpenRouter returned ${skills.length} skills for ${expectedCount} source items.`);
  }

  return skills.map(({ description = '', title = '' }) => ({ description: description.trim(), title: title.trim() }));
}

function transportExercises (exercises: Exercise[]): unknown[] {
  return exercises.map(({ description, ...exercise }) => ({ ...exercise, description: stripMarkdownImageReferences(description) }));
}

function abilityRepairInput (language: string, batch: StoredAbility[], chapterTitle?: string): unknown {
  return {
    abilities: batch.map(({ ability, content, id }, index) => ({ ability: ability ? { ...ability, q: ability.q.map(({ a, h, i, p }) => ({ a, h, i: i ? '[answer image present]' : '', p: p ? '[question image present]' : '' })) } : content, id, index })),
    bookLanguage: language,
    ...(chapterTitle ? { chapterTitle } : {})
  };
}

function exerciseRepairInput (language: string, batch: Exercise[], chapterTitle?: string): unknown {
  return {
    bookLanguage: language,
    exercises: batch.map(({ abilityMode = 'reasoning', conceptId, description, id, imageDescription = '', solution = '', solutionImageDescription = '', title }, index) => ({
      conceptId,
      exercise: { abilityMode, description: stripMarkdownImageReferences(description), imageDescription, solution, solutionImageDescription, title },
      id,
      index
    })),
    ...(chapterTitle ? { chapterTitle } : {})
  };
}

function exerciseForPageReplacement ({ abilityMode, conceptId, description, imageDescription, solution, solutionImageDescription, source, title }: Exercise): Omit<Exercise, 'bookPage' | 'id'> {
  return {
    abilityMode,
    conceptId,
    description: stripMarkdownImageReferences(description),
    imageDescription,
    solution,
    solutionImageDescription,
    source,
    title
  };
}
async function materializeAbilityImages (apiKey: string, conversion: AtomicAbilityConversion, svgModel: string): Promise<GeneratedAbility> {
  const q = conversion.ability.q.map((exercise) => ({ ...exercise, i: '', p: '' }));

  if (!conversion.imagePrompts) {
    return { ...conversion.ability, q };
  }

  for (let index = 0; index < q.length; index++) {
    const prompts = conversion.imagePrompts[index];

    if (prompts.changesImage && (!prompts.p || !prompts.i)) {
      throw new Error('A visual-modification Ability must define both starting and completed visual specifications.');
    }

    if (prompts.p) {
      q[index].p = await generateOpenRouterVisual(apiKey, prompts.p, svgModel, 'question', undefined, `Learner task: ${q[index].h}\nThis is a question visual. Reject any visible completion, highlighting, or cue that is not required by the starting-visual contract.`);
    }

    if (prompts.i) {
      q[index].i = await generateOpenRouterVisual(apiKey, prompts.i, svgModel, 'solution', prompts.changesImage ? q[index].p : undefined, `Learner task: ${q[index].h}\nCorrect answer: ${q[index].a}. The solution visual must agree with this answer.`);
    }
  }

  return { ...conversion.ability, q };
}
function compactJsonRepairPrompt (candidate: string, validationError: string, repairContext: string): string {
  return `Repair the rejected JSON candidate. Preserve every correct semantic detail and make only the changes required by the parser error and compact contract. Return only the corrected JSON object; no commentary.

COMPACT CONTRACT:
${repairContext}

PARSER ERROR:
${validationError}

REJECTED CANDIDATE:
${candidate}`;
}

async function requestValidatedJson<T> (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, parse: (content: string) => T, jsonObject = true, maxOutputTokens?: number, repairContext?: string, validationCycles = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < validationCycles; attempt++) {
    const candidate = await requestChatContent(client, model, systemPrompt, userPrompt, jsonObject, maxOutputTokens);

    try {
      // The parser is the fast local validation gate. In the normal case this
      // avoids the old unconditional second model call entirely.
      return parse(candidate);
    } catch (error) {
      lastError = error;
    }

    const validationError = lastError instanceof Error ? lastError.message : String(lastError ?? 'Local validation failed.');
    const validationPrompt = repairContext
      ? compactJsonRepairPrompt(candidate, validationError, repairContext)
      : JSON_VALIDATION_PROMPT(userPrompt, candidate, validationError);

    try {
      const repaired = await requestChatContent(client, model, systemPrompt, validationPrompt, jsonObject, maxOutputTokens);

      return parse(repaired);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI output failed local validation and repair.');
}

function ChapterNavigation ({ chapters, index, onChange }: { chapters: BookChapter[]; index: number; onChange: (index: number) => void }): React.ReactElement | null {
  const previous = useCallback((): void => onChange(index - 1), [index, onChange]);
  const next = useCallback((): void => onChange(index + 1), [index, onChange]);

  if (!chapters.length) {
    return null;
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

function ChapterTitleEditor ({ chapter, onError, onSaved }: { chapter: BookChapter; onError: (error: string) => void; onSaved: () => void }): React.ReactElement {
  const [title, setTitle] = useState(chapter.title);
  const save = useCallback((): void => {
    if (chapter.id === undefined || !title.trim()) {
      return;
    }

    updateBookChapterTitle(chapter.id, title.trim()).then(onSaved).catch((error) => onError(error instanceof Error ? error.message : 'Unable to rename the chapter.'));
  }, [chapter.id, onError, onSaved, title]);

  return <div className='chapterEditor'>
    <Input
      label='Chapter name'
      onChange={setTitle}
      onEnter={save}
      value={title}
    />
    <Button
      icon='save'
      isDisabled={!title.trim() || title.trim() === chapter.title}
      label='Save'
      onClick={save}
    />
  </div>;
}

function BookItem ({ abilityMode, description, id, imageDescription, onDelete, onDeleted, onError, solution, solutionImageDescription, title, type }: { abilityMode?: Exercise['abilityMode']; description: string; id?: number; imageDescription?: string; onDelete: (id: number) => Promise<void>; onDeleted: () => void; onError: (message: string) => void; solution?: string; solutionImageDescription?: string; title: string; type: 'concept' | 'exercise' }): React.ReactElement {
  const remove = useCallback((): void => {
    if (id === undefined) {
      return;
    }

    onDelete(id).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : `Unable to delete the ${type}.`));
  }, [id, onDelete, onDeleted, onError, type]);

  return <article className='contentCard'>
    <strong><KatexSpan content={title} /></strong>
    {description && <p><KatexSpan content={description} /></p>}
    {abilityMode && <p><small>{abilityMode}</small></p>}
    {imageDescription && <p><small>Required visual: <KatexSpan content={imageDescription} /></small></p>}
    {solution && <p><KatexSpan content={solution} /></p>}
    {solutionImageDescription && <p><small>Solution visual: <KatexSpan content={solutionImageDescription} /></small></p>}
    <Button
      icon='trash'
      onClick={remove}
    />
  </article>;
}

function SkillCard ({ bookId, onDeleted, onError, skill }: { bookId: number; onDeleted: () => void; onError: (message: string) => void; skill: Skill }): React.ReactElement {
  const remove = useCallback((): void => {
    if (skill.id === undefined) {
      return;
    }

    Promise.all([deleteSkill(skill.id), deleteAbilities(abilityModuleId(bookId, skill.id))]).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the Skill.'));
  }, [bookId, onDeleted, onError, skill.id]);

  return <article className='contentCard'>
    <strong><KatexSpan content={skill.title} /></strong>
    {skill.description && <p><KatexSpan content={skill.description} /></p>}
    <Button
      icon='trash'
      onClick={remove}
    />
  </article>;
}

function AbilityCard ({ onDeleted, onError, record }: { onDeleted: () => void; onError: (message: string) => void; record: StoredAbility }): React.ReactElement {
  const remove = useCallback((): void => {
    deleteAbility(record.id).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the Ability.'));
  }, [onDeleted, onError, record.id]);

  return <article className='contentCard'>
    {record.ability
      ? <>
        <strong><KatexSpan content={record.ability.h} /></strong>
        <ExerciseList
          areShownInitially
          exercises={record.ability.q}
          location='ability_info'
        />
      </>
      : <>
        <strong>Invalid Ability JSON</strong>
        <p>This record can be repaired with Fix abilities.</p>
      </>}
    <Button
      icon='trash'
      onClick={remove}
    />
  </article>;
}

function DuplicateExerciseSide ({ exercise, label }: { exercise: Exercise; label: string }): React.ReactElement {
  return <section className='duplicateAbilitySide'>
    <h5>{label}</h5>
    {exercise.id !== undefined && <p><small>Exercise ID: <code>{exercise.id}</code></small></p>}
    <strong><KatexSpan content={exercise.title} /></strong>
    <p><KatexSpan content={stripMarkdownImageReferences(exercise.description)} /></p>
    {exercise.abilityMode && <p><small>{exercise.abilityMode}</small></p>}
    {exercise.imageDescription && <p><small>Required visual: <KatexSpan content={exercise.imageDescription} /></small></p>}
    {exercise.solution && <div className='solution'><KatexSpan content={exercise.solution} /></div>}
    {exercise.solutionImageDescription && <p><small>Solution visual: <KatexSpan content={exercise.solutionImageDescription} /></small></p>}
  </section>;
}

function DuplicateAbilitySide ({ exerciseTitle, label, record }: { exerciseTitle?: string; label: string; record: StoredAbility }): React.ReactElement {
  return <section className='duplicateAbilitySide'>
    <h5>{label}</h5>
    {exerciseTitle && <p><small>Exercise: <KatexSpan content={exerciseTitle} /></small></p>}
    <p><small>Record ID: <code>{record.id}</code></small></p>
    {record.ability
      ? <>
        <strong><KatexSpan content={record.ability.h} /></strong>
        <ExerciseList
          areShownInitially
          exercises={record.ability.q}
          location='ability_info'
        />
      </>
      : <>
        <strong>Invalid Ability JSON</strong>
        <pre>{record.content}</pre>
      </>}
  </section>;
}

const chapterSessionKey = (bookId: number, view: SkillsView): string => `knowledge-upload-book-${bookId}-${view}-chapter`;

function getSessionChapter (bookId: number, view: SkillsView): number {
  try {
    const stored = Number(sessionStorage.getItem(chapterSessionKey(bookId, view)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function Skills ({ book, onAction, onBookChange, onEntityCountsChange, pipelineOnly = false, pipelinePrefix, showPipeline = true, view }: Props): React.ReactElement {
  const language = book.language ?? 'en';
  const [aiAction, setAiAction] = useState<AiAction>();
  const [chapterContent, setChapterContent] = useState<ChapterContent[]>([]);
  const [bookPageContent, setBookPageContent] = useState<BookPageContent[]>([]);
  const [chapterIndex, setChapterIndex] = useState(() => getSessionChapter(book.id, view));
  const [error, setError] = useState('');
  const [fixReview, setFixReview] = useState<FixReviewResult | null>(null);
  const [exerciseFixReview, setExerciseFixReview] = useState<ExerciseFixReviewResult | null>(null);
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressTotal, setProgressTotal] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
  const refresh = useCallback((): void => setRefreshToken((value) => value + 1), []);
  const changeChapter = useCallback((index: number): void => {
    setChapterIndex(index);

    try {
      sessionStorage.setItem(chapterSessionKey(book.id, view), String(index));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [book.id, view]);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      const [chapters, pages] = await Promise.all([getBookChapters(book.id), getBookPages(book.id)]);
      const pageRows = await Promise.all(pages.map(async (page: BookPage) => {
        const [concepts, exercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, page.pageNumber),
          getExercisesForBookPage([book.id, page.pageNumber])
        ]);

        return { concepts, exercises, page };
      }));
      const result = await Promise.all(chapters.map(async (chapter): Promise<ChapterContent> => {
        const skills = chapter.id === undefined ? [] : await getSkillsForChapter(chapter.id);
        const matchingPages = pageRows.filter(({ concepts, page }) => page.chapter === chapter.title || concepts.some(({ chapterId }) => chapterId === chapter.id));
        const exercises = matchingPages.flatMap(({ exercises }) => exercises);
        const records = (await Promise.all(exercises.flatMap(({ id }) => id === undefined ? [] : [getAbilities(exerciseAbilityModuleId(book.id, id))]))).flat() as Array<{ content: string; id: string; moduleId: string }>;
        const abilities = records.map(({ content, id, moduleId }): StoredAbility => {
          try {
            return { ability: parseStoredAbility(content), content, id, moduleId };
          } catch {
            return { ability: null, content, id, moduleId };
          }
        });

        return { abilities, chapter, concepts: matchingPages.flatMap(({ concepts }) => concepts.filter(({ chapterId }) => chapterId === chapter.id)), exercises, skills };
      }));

      if (active) {
        setBookPageContent(pageRows.map(({ exercises, page }) => ({ exercises, page })));
        setChapterContent(result);
        setChapterIndex((current) => Math.min(current, Math.max(0, result.length - 1)));
      }
    };

    load().catch(() => active && setError('Unable to load this book’s learning content.'));

    return () => {
      active = false;
    };
  }, [book.id, refreshToken]);

  const chapters = useMemo(() => chapterContent.map(({ chapter }) => chapter), [chapterContent]);
  const current = chapterContent[chapterIndex];
  const allSkills = useMemo(() => chapterContent.flatMap(({ skills }) => skills), [chapterContent]);
  const allExercises = useMemo(() => chapterContent.flatMap(({ exercises }) => exercises), [chapterContent]);
  const allBookExercises = useMemo(() => allExercises.filter(({ source }) => source !== 'generated'), [allExercises]);
  const allAbilities = useMemo(() => chapterContent.flatMap(({ abilities }) => abilities), [chapterContent]);

  useEffect(() => {
    onEntityCountsChange?.({ abilities: allAbilities.length, bookExercises: allBookExercises.length, exercises: allExercises.length });
  }, [allAbilities.length, allBookExercises.length, allExercises.length, onEntityCountsChange]);
  const exerciseTitlesByModuleId = useMemo(() => new Map(allExercises.flatMap(({ id, title }) => id === undefined ? [] : [[exerciseAbilityModuleId(book.id, id), title] as const])), [allExercises, book.id]);
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined ? [] : [...concepts.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'concept' as const, title }]), ...exercises.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description: stripMarkdownImageReferences(description), sourceId: id, sourceType: 'exercise' as const, title }])]), [chapterContent]);
  // Pipeline buttons must follow the persisted processing stage, not the
  // presence of generated/extracted rows. Concepts can already extract
  // exercises from the source book, but that does not mean the Exercises
  // pipeline step has been run. Stage 3 is set explicitly only when that
  // step completes. Stage 4 records a successful Fix exercises pass; only
  // after that should Abilities become available. Stage 7 means Abilities
  // have been generated; stage 8 independently records Fix abilities.
  const stage = book.processingStage ?? 0;
  const hasAbilities = allAbilities.length > 0;

  const setStage = useCallback(async (processingStage: number): Promise<void> => {
    const updated = await updateBookProcessingStage(book.id, processingStage);

    onBookChange(updated ?? { ...book, processingStage });
  }, [book, onBookChange]);

  const createClient = useCallback(async (): Promise<OpenAI> => {
    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('No OpenRouter token found. Add it in Settings.');
    }

    return new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1', dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }, maxRetries: 0 });
  }, []);

  const requestInputs = useMemo((): string[] => {
    if (aiAction === 'skills') {
      return Array.from({ length: Math.ceil(skillSources.length / BATCH_SIZE) }, (_, index) => SOURCES_TO_SKILLS_REQUEST_PROMPT(language, skillSources.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)));
    }

    if (aiAction === 'exercises') {
      // Ability generation is source-bounded: each semantic request contains
      // exactly one Exercise instead of a chapter/batch plus accumulated drafts.
      return chapterContent.flatMap(({ chapter, exercises }) => exercises.map((exercise) => abilityBlueprintRequestPrompt(language, chapter.title, [transportCompactAbilitySourceExercise(exercise)])));
    }

    if (aiAction === 'fixExercises') {
      return chapterContent.filter(({ exercises }) => exercises.length > 0).map(({ chapter, exercises }) => FIX_EXERCISES_REQUEST_PROMPT(exerciseRepairInput(language, exercises, chapter.title)));
    }

    if (aiAction === 'fix') {
      return chapterContent.filter(({ abilities }) => abilities.length > 0).map(({ abilities, chapter }) => FIX_ABILITIES_REQUEST_PROMPT(abilityRepairInput(language, abilities, chapter.title)));
    }

    return [];
  }, [aiAction, chapterContent, language, skillSources]);
  const maxChapterAbilityCount = Math.max(1, ...chapterContent.map(({ abilities }) => abilities.length));
  const maxChapterExerciseCount = Math.max(1, ...chapterContent.map(({ exercises }) => exercises.length));
  const generationOutputTokens = aiAction === 'exercises' ? 3_200 : aiAction === 'fixExercises' ? maxChapterExerciseCount * 550 : aiAction === 'fix' ? maxChapterAbilityCount * 700 : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const validationInputs = useMemo(() => aiAction === 'exercises'
    // The live workflow now has two bounded semantic calls per source:
    // atomic planning, then final materialization (including visual specs).
    ? requestInputs.flatMap((input) => [input, input])
    : requestInputs, [aiAction, requestInputs]);
  const outputTokens = generationOutputTokens;
  const estimate = formatAiInputEstimate(estimateAiInput(selectedModel, validationInputs, outputTokens));
  const iconForStage = useCallback((requiredStage: number): 'play' | 'rotate-left' => stage >= requiredStage ? 'rotate-left' : 'play', [stage]);

  const deleteExerciseWithAbilities = useCallback(async (exerciseId: number): Promise<void> => {
    await deleteAbilities(exerciseAbilityModuleId(book.id, exerciseId));
    await deleteExercise(exerciseId);
  }, [book.id]);

  const deleteConceptWithExercises = useCallback(async (conceptId: number): Promise<void> => {
    const referencedExercises = allExercises.filter(({ conceptId: exerciseConceptId, id }) => id !== undefined && exerciseConceptId === conceptId);

    for (const exercise of referencedExercises) {
      await deleteExerciseWithAbilities(exercise.id as number);
    }

    await deleteBookConcept(conceptId);
  }, [allExercises, deleteExerciseWithAbilities]);

  const beginProgress = useCallback((label: string, total: number): void => {
    setAiAction(undefined); setError(''); setFixReview(null); setExerciseFixReview(null); setNotice(''); setIsBusy(true); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));
  }, []);

  const generateSkills = useCallback(async (): Promise<void> => {
    beginProgress('Generating Skills', skillSources.length);

    try {
      const client = await createClient();
      const generatedByChapter = new Map<number, Array<Omit<Skill, 'chapterId' | 'id'>>>();
      const batches = Array.from({ length: Math.ceil(skillSources.length / BATCH_SIZE) }, (_, index) => skillSources.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
      let completed = 0;
      const results = await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async (batch) => {
        const systemPrompt = SKILLS_GENERATION_SYSTEM_PROMPT(language);
        const userPrompt = SOURCES_TO_SKILLS_REQUEST_PROMPT(language, batch);
        const generated = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseGeneratedSkills(content, batch.length), true);

        completed += batch.length;
        setProgress(Math.min(skillSources.length, completed));

        return { batch, generated };
      });

      // mapConcurrent preserves input order, so ranks remain deterministic even
      // when later OpenRouter requests finish before earlier ones.
      for (const { batch, generated } of results) {
        generated.forEach((skill, index) => {
          const rows = generatedByChapter.get(batch[index].chapterId) ?? [];
          const source = batch[index];

          rows.push({
            ...skill,
            bookConceptIds: source.sourceType === 'concept' ? [source.sourceId] : [],
            exerciseIds: source.sourceType === 'exercise' ? [source.sourceId] : [],
            rank: rows.length
          });
          generatedByChapter.set(source.chapterId, rows);
        });
      }

      await Promise.all(allSkills.flatMap(({ id }) => id === undefined ? [] : [deleteAbilities(abilityModuleId(book.id, id))]));
      await Promise.all(chapters.flatMap(({ id }) => id === undefined ? [] : [replaceSkillsForChapter(id, generatedByChapter.get(id) ?? [])]));
      await setStage(4); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate Skills.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkills, beginProgress, book.id, chapters, createClient, language, refresh, selectedModel, setStage, skillSources]);

  const generateExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating atomic Abilities', allExercises.length);

    try {
      if (!allExercises.length) {
        throw new Error('No Exercises are available to generate Abilities from.');
      }

      if (allExercises.some(({ id }) => id === undefined)) {
        throw new Error('Every Exercise must have an id before Abilities can be generated.');
      }

      const client = await createClient();
      const imageApiKey = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!imageApiKey) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const pending = new Map<number, Exercise>(allExercises.map((exercise) => [exercise.id as number, exercise]));
      // Keep each source Exercise atomic at persistence time: either every
      // locally validated sub-Ability for that source is ready (including required
      // visuals), or its existing DB records are left untouched for retry.
      const generatedByExerciseId = new Map<number, GeneratedAbility[]>();
      // Once the semantic workflow has produced a locally valid conversion,
      // keep it across retries. A transient visual timeout/QA failure should
      // retry only visual materialization, not regenerate the whole Ability.
      const conversionsByExerciseIdCache = new Map<number, AtomicAbilityConversion[]>();
      // Planning is a separate cached semantic stage. If final Ability JSON is
      // rejected or a request times out, retry materialization from this plan
      // instead of asking the model to decompose the source Exercise again.
      const blueprintsByExerciseIdCache = new Map<number, AbilityBlueprint[]>();
      const maxAttempts = 3;
      let lastAttemptError = '';

      for (let attempt = 1; attempt <= maxAttempts && pending.size; attempt++) {
        const sourcesNeedingPlan = chapterContent.flatMap(({ chapter, exercises: chapterExercises }) => chapterExercises
          .filter(({ id }) => id !== undefined && pending.has(id) && !blueprintsByExerciseIdCache.has(id))
          .map((exercise) => ({ chapterTitle: chapter.title, exercise })));
        const plannedSources = await mapConcurrent(sourcesNeedingPlan, ABILITY_GENERATION_CONCURRENCY, async ({ chapterTitle, exercise }): Promise<{ blueprints: AbilityBlueprint[]; exercise: Exercise }> => {
          const systemPrompt = ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT(language, chapterTitle);
          const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(client, selectedModel, systemPrompt, prompt, parse, true, options?.maxOutputTokens, options?.repairContext, options?.validationCycles ?? 1);

          try {
            const blueprints = await planAtomicAbilityExercise(language, chapterTitle, exercise, runJson);

            lastAttemptError = '';

            return { blueprints, exercise };
          } catch (caught) {
            lastAttemptError = caught instanceof Error ? caught.message : 'Unknown OpenRouter planning error.';

            return { blueprints: [], exercise };
          }
        });

        for (const { blueprints, exercise } of plannedSources) {
          if (blueprints.length && exercise.id !== undefined) {
            blueprintsByExerciseIdCache.set(exercise.id, blueprints);
          }
        }

        const sourcesNeedingMaterialization = chapterContent.flatMap(({ chapter, exercises: chapterExercises }) => chapterExercises
          .filter(({ id }) => id !== undefined && pending.has(id) && blueprintsByExerciseIdCache.has(id) && !conversionsByExerciseIdCache.has(id))
          .map((exercise) => ({ chapterTitle: chapter.title, exercise })));
        const materializedSources = await mapConcurrent(sourcesNeedingMaterialization, ABILITY_GENERATION_CONCURRENCY, async ({ chapterTitle, exercise }): Promise<{ conversions: AtomicAbilityConversion[]; exercise: Exercise }> => {
          const exerciseId = exercise.id as number;
          const blueprints = blueprintsByExerciseIdCache.get(exerciseId) ?? [];
          const systemPrompt = ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT(language, chapterTitle);
          const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(client, selectedModel, systemPrompt, prompt, parse, true, options?.maxOutputTokens, options?.repairContext, options?.validationCycles ?? 1);

          try {
            const conversions = await materializeAtomicAbilityExercise(language, chapterTitle, exercise, blueprints, runJson);

            lastAttemptError = '';

            return { conversions, exercise };
          } catch (caught) {
            lastAttemptError = caught instanceof Error ? caught.message : 'Unknown OpenRouter materialization error.';

            return { conversions: [], exercise };
          }
        });

        for (const { conversions, exercise } of materializedSources) {
          if (conversions.length && exercise.id !== undefined) {
            conversionsByExerciseIdCache.set(exercise.id, conversions.sort((a, b) => a.skillIndex - b.skillIndex));
          }
        }

        // Retry materialization for every pending Exercise whose semantic
        // conversion is already valid, including conversions cached from an
        // earlier attempt. This prevents image-only failures from triggering
        // another expensive Ability workflow pass.
        const sourcesToMaterialize = allExercises.filter(({ id }) => id !== undefined && pending.has(id) && conversionsByExerciseIdCache.has(id));

        await mapConcurrent(sourcesToMaterialize, VISUAL_MATERIALIZATION_CONCURRENCY, async (source) => {
          const exerciseId = source.id as number;
          const sourceConversions = conversionsByExerciseIdCache.get(exerciseId) ?? [];

          if (!pending.has(exerciseId) || !sourceConversions.length) {
            return;
          }

          try {
            const abilities = await mapConcurrent(sourceConversions, VISUALS_PER_EXERCISE_CONCURRENCY, (conversion) => materializeAbilityImages(imageApiKey, conversion, selectedModel));

            generatedByExerciseId.set(exerciseId, abilities);
            pending.delete(exerciseId);
            setProgress(generatedByExerciseId.size);
          } catch (imageError) {
            lastAttemptError = imageError instanceof Error ? imageError.message : 'Unable to generate or validate a required Ability image.';
          }
        });
      }

      await Promise.all(Array.from(generatedByExerciseId, ([exerciseId, abilities]) => replaceAbilities(exerciseAbilityModuleId(book.id, exerciseId), abilities.map((ability) => JSON.stringify(ability)))));

      if (generatedByExerciseId.size) {
        // Any newly generated Ability invalidates a prior Fix abilities pass.
        // Stage 7 means Abilities exist; stage 8 is reserved for Fix abilities.
        await setStage(ABILITIES_STAGE);
      } else if (allAbilities.length && stage < ABILITIES_STAGE) {
        // Existing Abilities can still make this pipeline stage available even
        // when this attempt produced no replacement rows.
        await setStage(ABILITIES_STAGE);
      }

      refresh();

      const generatedAbilityCount = Array.from(generatedByExerciseId.values()).reduce((count, abilities) => count + abilities.length, 0);

      if (pending.size && generatedByExerciseId.size) {
        const unresolved = Array.from(pending.values()).map(({ id, title }) => `${id}: ${title}`).join('; ');

        setNotice(`Generated ${generatedAbilityCount} atomic Abilities from ${generatedByExerciseId.size} of ${allExercises.length} Exercises. ${pending.size} Exercise${pending.size === 1 ? '' : 's'} remained unchanged: ${unresolved}`);
      } else if (!generatedByExerciseId.size && pending.size && allAbilities.length) {
        setNotice(`No new Abilities were generated after ${maxAttempts} attempts. The existing ${allAbilities.length} Abilit${allAbilities.length === 1 ? 'y remains' : 'ies remain'} available; unresolved Exercises were left unchanged.`);
      } else if (!generatedByExerciseId.size && pending.size) {
        const suffix = lastAttemptError ? ` Last attempt: ${lastAttemptError}` : '';

        setError(`No Abilities were generated after ${maxAttempts} attempts.${suffix}`);
      } else {
        setNotice(`Generated ${generatedAbilityCount} atomic Abilities from ${generatedByExerciseId.size} Exercises.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate Abilities.');
    } finally {
      setIsBusy(false);
    }
  }, [allAbilities.length, allExercises, beginProgress, book.id, chapterContent, createClient, language, refresh, selectedModel, setStage, stage]);

  const fixExercises = useCallback(async (): Promise<void> => {
    beginProgress('Fixing Exercise errors', allExercises.length);

    try {
      if (!allExercises.length) {
        throw new Error('No Exercises are available to fix.');
      }

      if (allExercises.some(({ id }) => id === undefined)) {
        throw new Error('Every Exercise must have an id before Exercises can be fixed.');
      }

      const client = await createClient();
      const replacements = new Map<number, { errors: string[]; exercise: Exercise }>();
      const duplicatePairs = new Map<number, DuplicateExerciseReview>();
      const batches = chapterContent
        .filter(({ exercises }) => exercises.length > 0)
        .map(({ chapter, exercises }) => ({ batch: exercises, chapterTitle: chapter.title }));
      let completed = 0;

      await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async ({ batch, chapterTitle }) => {
        const originalIds = batch.map(({ id }) => id as number);
        const systemPrompt = REPAIR_SYSTEM_PROMPT(language);
        const userPrompt = FIX_EXERCISES_REQUEST_PROMPT(exerciseRepairInput(language, batch, chapterTitle));
        const result = await requestValidatedJson(
          client,
          selectedModel,
          systemPrompt,
          userPrompt,
          (content) => parseExerciseRepairResult(content, batch, originalIds),
          true
        );
        const batchDuplicateIds = new Set(result.duplicatePairs.map(({ deletedExerciseId }) => deletedExerciseId));

        result.duplicatePairs.forEach(({ deletedExerciseId, keptExerciseId }) => {
          const kept = batch.find(({ id }) => id === keptExerciseId);
          const deleted = batch.find(({ id }) => id === deletedExerciseId);

          if (!kept || !deleted) {
            throw new Error('OpenRouter returned a duplicate Exercise pair that does not exist in this chapter.');
          }

          duplicatePairs.set(deletedExerciseId, { chapterTitle, deleted, kept });
        });
        result.reviews.forEach((review) => {
          if (review.hasErrors && review.exercise) {
            const original = batch[review.index];
            const id = original.id as number;

            if (!batchDuplicateIds.has(id)) {
              replacements.set(id, { errors: review.errors, exercise: review.exercise });
            }
          }
        });
        completed += batch.length;
        setProgress(Math.min(allExercises.length, completed));
      });

      const duplicateIds = new Set(duplicatePairs.keys());

      duplicateIds.forEach((id) => replacements.delete(id));
      const review: ExerciseFixReviewResult = {
        checked: allExercises.length,
        duplicatePairs: Array.from(duplicatePairs.values()),
        items: Array.from(replacements, ([exerciseId, { errors, exercise }]) => ({ errors, exercise, exerciseId }))
      };
      const unchanged = Math.max(0, allExercises.length - replacements.size - duplicateIds.size);

      // This is intentionally only a proposal. The database and processing
      // stage are not touched until the user explicitly accepts the review
      // popup below.
      setExerciseFixReview(review);
      setNotice(`Review ready: ${replacements.size} Exercise fix${replacements.size === 1 ? '' : 'es'}, ${duplicateIds.size} duplicate deletion${duplicateIds.size === 1 ? '' : 's'}, ${unchanged} unchanged. No database changes have been made.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix Exercise errors.');
    } finally {
      setIsBusy(false);
    }
  }, [allExercises, beginProgress, chapterContent, createClient, language, selectedModel]);

  const fixAbilities = useCallback(async (): Promise<void> => {
    beginProgress('Fixing Ability errors', allAbilities.length);

    try {
      const client = await createClient();
      const replacements = new Map<string, { ability: GeneratedAbility; errors: string[]; record: StoredAbility }>();
      const duplicatePairs = new Map<string, DuplicateAbilityReview>();
      // Duplicate detection needs complete chapter context, so every chapter is
      // one AI request. Different chapters may still be reviewed concurrently.
      const batches = chapterContent
        .filter(({ abilities }) => abilities.length > 0)
        .map(({ abilities, chapter }) => ({ batch: abilities, chapterTitle: chapter.title }));
      let completed = 0;

      await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async ({ batch, chapterTitle }) => {
        const systemPrompt = REPAIR_SYSTEM_PROMPT(language);
        const userPrompt = FIX_ABILITIES_REQUEST_PROMPT(abilityRepairInput(language, batch, chapterTitle));
        const result = await requestValidatedJson(
          client,
          selectedModel,
          systemPrompt,
          userPrompt,
          (content) => parseAbilityRepairResult(content, batch.map(({ ability }) => ability), batch.map(({ id }) => id)),
          true
        );
        const batchDuplicateIds = new Set(result.duplicatePairs.map(({ deletedAbilityId }) => deletedAbilityId));

        result.duplicatePairs.forEach(({ deletedAbilityId, keptAbilityId }) => {
          const kept = batch.find(({ id }) => id === keptAbilityId);
          const deleted = batch.find(({ id }) => id === deletedAbilityId);

          if (!kept || !deleted) {
            throw new Error('OpenRouter returned a duplicate Ability pair that does not exist in this chapter.');
          }

          duplicatePairs.set(deletedAbilityId, {
            chapterTitle,
            deleted,
            deletedExerciseTitle: exerciseTitlesByModuleId.get(deleted.moduleId),
            kept,
            keptExerciseTitle: exerciseTitlesByModuleId.get(kept.moduleId)
          });
        });
        result.reviews.forEach((review) => {
          if (review.hasErrors && review.ability) {
            const record = batch[review.index];

            // Duplicate copies are deleted after the review phase, so do not
            // spend a write replacing a record that is about to disappear.
            if (!batchDuplicateIds.has(record.id)) {
              replacements.set(record.id, { ability: review.ability, errors: review.errors, record });
            }
          }
        });
        completed += batch.length;
        setProgress(Math.min(allAbilities.length, completed));
      });

      const duplicateIds = new Set(duplicatePairs.keys());

      duplicateIds.forEach((id) => replacements.delete(id));

      setFixReview({
        checked: allAbilities.length,
        duplicatePairs: Array.from(duplicatePairs.values(), (pair) => {
          const keptReplacement = replacements.get(pair.kept.id);

          return keptReplacement
            ? { ...pair, kept: { ...pair.kept, ability: keptReplacement.ability, content: JSON.stringify(keptReplacement.ability) } }
            : pair;
        }),
        items: Array.from(replacements.values(), ({ ability, errors, record }) => ({
          ability,
          errors,
          exerciseTitle: exerciseTitlesByModuleId.get(record.moduleId),
          record,
          recordId: record.id
        }))
      });
      const unchanged = Math.max(0, allAbilities.length - replacements.size - duplicateIds.size);

      // Keep the review side-effect free. Applying the proposal is a separate,
      // explicit action in the results popup.
      setNotice(`Review ready: ${replacements.size} Ability fix${replacements.size === 1 ? '' : 'es'}, ${duplicateIds.size} duplicate deletion${duplicateIds.size === 1 ? '' : 's'}, ${unchanged} unchanged. No database changes have been made.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix Ability errors.');
    } finally {
      setIsBusy(false);
    }
  }, [allAbilities.length, beginProgress, chapterContent, createClient, exerciseTitlesByModuleId, language, selectedModel]);

  const confirm = useCallback((): void => {
    if (aiAction === 'skills') {
      generateSkills().catch(console.error);
    }

    if (aiAction === 'exercises') {
      onAction?.('preExercisesExercises');
      generateExercises().catch(console.error);
    }

    if (aiAction === 'fixExercises') {
      fixExercises().catch(console.error);
    }

    if (aiAction === 'fix') {
      fixAbilities().catch(console.error);
    }
  }, [aiAction, fixAbilities, fixExercises, generateExercises, generateSkills, onAction]);
  const closeConfirmation = useCallback((): void => setAiAction(undefined), []);
  const closeFixReview = useCallback((): void => {
    setFixReview(null);
    setNotice('Proposed Ability changes were discarded. No database changes were made.');
  }, []);
  const closeExerciseFixReview = useCallback((): void => {
    setExerciseFixReview(null);
    setNotice('Proposed Exercise changes were discarded. No database changes were made.');
  }, []);
  const applyAbilityFixReview = useCallback(async (): Promise<void> => {
    if (!fixReview) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      for (const { ability, record } of fixReview.items) {
        const newRecordId = await storeAbility(record.moduleId, JSON.stringify(ability));

        if (newRecordId !== record.id) {
          await deleteAbility(record.id);
        }
      }

      for (const { deleted } of fixReview.duplicatePairs) {
        await deleteAbility(deleted.id);
      }

      if (stage < FIX_ABILITIES_STAGE) {
        await setStage(FIX_ABILITIES_STAGE);
      }

      const fixed = fixReview.items.length;
      const deleted = fixReview.duplicatePairs.length;

      setFixReview(null);
      setNotice(`Applied Fix abilities review: ${fixed} corrected, ${deleted} duplicate${deleted === 1 ? '' : 's'} deleted.`);
      refresh();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply Fix abilities changes.');
    } finally {
      setIsBusy(false);
    }
  }, [fixReview, onAction, refresh, setStage, stage]);
  const applyExerciseFixReview = useCallback(async (): Promise<void> => {
    if (!exerciseFixReview) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const replacements = new Map(exerciseFixReview.items.map(({ exercise, exerciseId }) => [exerciseId, exercise] as const));
      const duplicateIds = new Set(exerciseFixReview.duplicatePairs.flatMap(({ deleted }) => deleted.id === undefined ? [] : [deleted.id]));
      const abilityContentsByExerciseId = new Map<number, string[]>();

      allExercises.forEach(({ id }) => {
        if (id === undefined) {
          return;
        }

        const moduleId = exerciseAbilityModuleId(book.id, id);

        abilityContentsByExerciseId.set(id, allAbilities.filter((record) => record.moduleId === moduleId).map(({ content }) => content));
      });

      for (const { exercises, page } of bookPageContent) {
        const pageHasChanges = exercises.some(({ id }) => id !== undefined && (duplicateIds.has(id) || replacements.has(id)));

        if (!pageHasChanges) {
          continue;
        }

        const keptEntries = exercises
          .filter(({ id }) => id === undefined || !duplicateIds.has(id))
          .map((original) => ({
            corrected: original.id === undefined ? original : replacements.get(original.id) ?? original,
            original
          }));

        await replaceExercisesForBookPage([book.id, page.pageNumber], keptEntries.map(({ corrected }) => exerciseForPageReplacement(corrected)));

        const storedExercises = await getExercisesForBookPage([book.id, page.pageNumber]);

        if (storedExercises.length !== keptEntries.length || storedExercises.some(({ id }) => id === undefined)) {
          throw new Error('Unable to remap Exercises after applying fixes.');
        }

        for (let index = 0; index < keptEntries.length; index++) {
          const oldId = keptEntries[index].original.id;
          const newId = storedExercises[index].id as number;

          if (oldId === undefined) {
            continue;
          }

          const oldModuleId = exerciseAbilityModuleId(book.id, oldId);
          const wasCorrected = replacements.has(oldId);

          if (!wasCorrected && oldId !== newId) {
            const contents = abilityContentsByExerciseId.get(oldId) ?? [];

            if (contents.length) {
              await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
            }
          }

          if (wasCorrected || oldId !== newId) {
            await deleteAbilities(oldModuleId);
          }
        }

        for (const deletedId of exercises.flatMap(({ id }) => id !== undefined && duplicateIds.has(id) ? [id] : [])) {
          await deleteAbilities(exerciseAbilityModuleId(book.id, deletedId));
        }
      }

      const hasChanges = replacements.size > 0 || duplicateIds.size > 0;

      // Correcting Exercises invalidates generated Abilities, so a committed
      // change intentionally returns the pipeline to stage 4. A no-op review
      // only advances to stage 4 when this step had not yet been completed.
      if (hasChanges || stage < 4) {
        await setStage(4);
      }

      const fixed = replacements.size;
      const deleted = duplicateIds.size;

      setExerciseFixReview(null);
      setNotice(`Applied Fix exercises review: ${fixed} corrected, ${deleted} duplicate${deleted === 1 ? '' : 's'} deleted.`);
      refresh();
      onAction?.('conceptExercises');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply Fix exercises changes.');
    } finally {
      setIsBusy(false);
    }
  }, [allAbilities, allExercises, book.id, bookPageContent, exerciseFixReview, onAction, refresh, setStage, stage]);
  const openExerciseGeneration = useCallback((): void => {
    setAiAction('exercises');
  }, []);
  const openExerciseFix = useCallback((): void => {
    // Opening the confirmation must be a purely local state change. Switching
    // the parent pane here can remount/re-render the surrounding reader before
    // the modal is used, which made this action appear one-shot in some flows.
    // Keep pane navigation deferred until the review popup is explicitly applied.
    setAiAction('fixExercises');
  }, []);
  const openAbilityFix = useCallback((): void => {
    setAiAction('fix');
  }, []);

  return <StyledSkills className={pipelineOnly ? 'pipelineOnly' : undefined}>
    {exerciseFixReview && (
      <Modal
        header='Fix exercises results'
        onClose={closeExerciseFixReview}
        size='large'
      >
        <Modal.Content>
          <p>Checked {exerciseFixReview.checked} Exercises. Proposed {exerciseFixReview.items.length} correction{exerciseFixReview.items.length === 1 ? '' : 's'} and {exerciseFixReview.duplicatePairs.length} duplicate deletion{exerciseFixReview.duplicatePairs.length === 1 ? '' : 's'}. No database changes have been made yet.</p>
          {exerciseFixReview.duplicatePairs.length > 0 && <>
            <h4>Deleted duplicates</h4>
            <div className='duplicateReviewList'>
              {exerciseFixReview.duplicatePairs.map(({ chapterTitle, deleted, kept }, index) => <article
                className='duplicateReviewItem'
                key={deleted.id ?? `deleted-${index}`}
              >
                <strong>{index + 1}. Chapter: <KatexSpan content={chapterTitle} /></strong>
                <div className='duplicatePairComparison'>
                  <DuplicateExerciseSide
                    exercise={kept}
                    label='Kept'
                  />
                  <DuplicateExerciseSide
                    exercise={deleted}
                    label='Deleted duplicate'
                  />
                </div>
              </article>)}
            </div>
          </>}
          {exerciseFixReview.items.length
            ? <div className='fixReviewList'>
              {exerciseFixReview.items.map(({ errors, exercise, exerciseId }, index) => <article
                className='fixReviewItem'
                key={exerciseId}
              >
                <strong>{index + 1}. <KatexSpan content={exercise.title} /></strong>
                <p><small>Exercise ID: <code>{exerciseId}</code></small></p>
                <h5>Corrected errors</h5>
                <ul>
                  {errors.map((message, errorIndex) => <li key={`${exerciseId}-${errorIndex}`}><KatexSpan content={message} /></li>)}
                </ul>
                <h5>Corrected result</h5>
                <div className='fixedExercisePreview'>
                  <p><KatexSpan content={stripMarkdownImageReferences(exercise.description)} /></p>
                  {exercise.abilityMode && <p><small>{exercise.abilityMode}</small></p>}
                  {exercise.imageDescription && <p><small>Required visual: <KatexSpan content={exercise.imageDescription} /></small></p>}
                  {exercise.solutionImageDescription && <p><small>Solution visual: <KatexSpan content={exercise.solutionImageDescription} /></small></p>}
                  {exercise.solution && <div className='solution'><KatexSpan content={exercise.solution} /></div>}
                </div>
              </article>)}
            </div>
            : <p>No Exercise errors were found.</p>}
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
        </Modal.Content>
      </Modal>
    )}
    {fixReview && (
      <Modal
        header='Fix abilities results'
        onClose={closeFixReview}
        size='large'
      >
        <Modal.Content>
          <p>Checked {fixReview.checked} Abilities. Proposed {fixReview.items.length} correction{fixReview.items.length === 1 ? '' : 's'} and {fixReview.duplicatePairs.length} duplicate deletion{fixReview.duplicatePairs.length === 1 ? '' : 's'}. No database changes have been made yet.</p>
          {fixReview.duplicatePairs.length > 0 && <>
            <h4>Deleted duplicates</h4>
            <div className='duplicateReviewList'>
              {fixReview.duplicatePairs.map(({ chapterTitle, deleted, deletedExerciseTitle, kept, keptExerciseTitle }, index) => <article
                className='duplicateReviewItem'
                key={deleted.id}
                                                                                                                          >
                <strong>{index + 1}. Chapter: <KatexSpan content={chapterTitle} /></strong>
                <div className='duplicatePairComparison'>
                  <DuplicateAbilitySide
                    exerciseTitle={keptExerciseTitle}
                    label='Kept'
                    record={kept}
                  />
                  <DuplicateAbilitySide
                    exerciseTitle={deletedExerciseTitle}
                    label='Deleted duplicate'
                    record={deleted}
                  />
                </div>
              </article>)}
            </div>
          </>}
          {fixReview.items.length
            ? <div className='fixReviewList'>
              {fixReview.items.map(({ ability, errors, exerciseTitle, recordId }, index) => <article
                className='fixReviewItem'
                key={recordId}
                                                                                               >
                <strong>{index + 1}. <KatexSpan content={ability.h} /></strong>
                {exerciseTitle && <p><small>Exercise: <KatexSpan content={exerciseTitle} /></small></p>}
                <h5>Corrected errors</h5>
                <ul>
                  {errors.map((message, errorIndex) => <li key={`${recordId}-${errorIndex}`}><KatexSpan content={message} /></li>)}
                </ul>
                <h5>Corrected result</h5>
                <div className='fixedAbilityPreview'>
                  <ExerciseList
                    areShownInitially
                    exercises={ability.q}
                    location='ability_info'
                  />
                </div>
              </article>)}
            </div>
            : <p>No Ability errors were found.</p>}
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isBusy}
              label='Discard'
              onClick={closeFixReview}
            />
            <Button
              icon='check'
              isDisabled={isBusy}
              label={fixReview.items.length || fixReview.duplicatePairs.length ? 'Apply changes' : 'Confirm review'}
              onClick={() => applyAbilityFixReview().catch(console.error)}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>
    )}
    {aiAction && (
      <Modal
        header='Confirm AI processing'
        onClose={closeConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{estimate}</p>
          <Dropdown
            className='modelSelect'
            isDisabled={isBusy}
            label='Model'
            onChange={setSelectedModel}
            options={OPENAI_MODELS}
            value={selectedModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closeConfirmation}
            />
            <Button
              icon='check'
              label='Continue'
              onClick={confirm}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>
    )}
    {isBusy && (
      <div className='processingOverlay'>
        <RoundProgress
          total={progressTotal}
          value={progress}
        />
        <strong>{progressLabel}</strong>
        <span>{progress} / {progressTotal}</span>
      </div>
    )}
    {showPipeline && <div className='pipeline'>
      {pipelinePrefix}
      <span className='pipelineStep'><span>›</span><Button
        icon={iconForStage(4)}
        isDisabled={isBusy || stage < 3 || !allExercises.length}
        label='Fix exercises'
        onClick={openExerciseFix}
                                                   /></span>
      <span className='pipelineStep'><span>›</span><Button
        icon={iconForStage(ABILITIES_STAGE)}
        isDisabled={isBusy || stage < 4 || !allExercises.length}
        label='Abilities'
        onClick={openExerciseGeneration}
                                                   /></span>
      <span className='pipelineStep'><span>›</span><Button
        icon={iconForStage(FIX_ABILITIES_STAGE)}
        isDisabled={isBusy || stage < ABILITIES_STAGE || !hasAbilities}
        label='Fix abilities'
        onClick={openAbilityFix}
                                                   /></span>
    </div>}
    {error && <p
      className='errorMessage'
      role='alert'
              >{error}</p>}
    {notice && <p
      className='noticeMessage'
      role='status'
               >{notice}</p>}
    {!pipelineOnly && <>
      <ChapterNavigation
        chapters={chapters}
        index={chapterIndex}
        onChange={changeChapter}
      />
      {!current && <p>No chapters have been generated for this book.</p>}
      {current && (
        <>
          <ChapterTitleEditor
            chapter={current.chapter}
            onError={setError}
            onSaved={refresh}
          />
          {view === 'conceptsSkills' && (
            <div className='columns'>
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
                    onError={setError}
                    title={concept.title}
                    type='concept'
                  />
                ))}
                {current.exercises.map((exercise) => (
                  <BookItem
                    abilityMode={exercise.abilityMode}
                    description={stripMarkdownImageReferences(exercise.description)}
                    id={exercise.id}
                    imageDescription={exercise.imageDescription}
                    key={`exercise-${exercise.id ?? 'new'}`}
                    onDelete={deleteExerciseWithAbilities}
                    onDeleted={refresh}
                    onError={setError}
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
                  bookId={book.id}
                  key={skill.id}
                  onDeleted={refresh}
                  onError={setError}
                  skill={skill}
                                               />)}
              </section>
            </div>
          )}
          {view === 'preExercisesExercises' && (
            <div className='singlePane abilitiesPane'>
              <h3>Exercises and Abilities</h3>
              {!current.exercises.length && <p>No Exercises in this chapter.</p>}
              {current.exercises.map((exercise) => {
                const matchedAbilities = exercise.id === undefined
                  ? []
                  : current.abilities.filter(({ moduleId }) => moduleId === exerciseAbilityModuleId(book.id, exercise.id as number));

                return <section
                  className='exerciseWithAbilities'
                  key={`exercise-${exercise.id ?? 'new'}`}
                       >
                  <BookItem
                    abilityMode={exercise.abilityMode}
                    description={stripMarkdownImageReferences(exercise.description)}
                    id={exercise.id}
                    imageDescription={exercise.imageDescription}
                    onDelete={deleteExerciseWithAbilities}
                    onDeleted={refresh}
                    onError={setError}
                    solution={exercise.solution}
                    solutionImageDescription={exercise.solutionImageDescription}
                    title={exercise.title}
                    type='exercise'
                  />
                  <div className='matchedAbilities'>
                    {matchedAbilities.length
                      ? matchedAbilities.map((record) => <AbilityCard
                        key={record.id}
                        onDeleted={refresh}
                        onError={setError}
                        record={record}
                                                        />)
                      : <p className='noAbility'>No Ability generated for this Exercise.</p>}
                  </div>
                </section>;
              })}
              {current.abilities.some(({ moduleId }) => !current.exercises.some(({ id }) => id !== undefined && moduleId === exerciseAbilityModuleId(book.id, id))) && <section className='unmatchedAbilities'>
                <h4>Unmatched Abilities</h4>
                {current.abilities.filter(({ moduleId }) => !current.exercises.some(({ id }) => id !== undefined && moduleId === exerciseAbilityModuleId(book.id, id))).map((record) => <AbilityCard
                  key={record.id}
                  onDeleted={refresh}
                  onError={setError}
                  record={record}
                                                                                                                                                                             />)}
              </section>}
            </div>
          )}
        </>
      )}
    </>}
  </StyledSkills>;
}

const StyledSkills = styled.div`
  background: var(--bg-page); border-radius: 0.5rem; box-sizing: border-box; min-width: 0; padding: 1rem; position: relative; width: 100%;
  &.pipelineOnly { background: transparent; border-radius: 0; margin-top: 0; padding: 0; }
  .pipeline { align-items: center; display: flex; flex-wrap: wrap; gap: 0.35rem 0.75rem; margin-bottom: 0.75rem; }
  .pipelineStep { align-items: center; display: inline-flex; gap: 0.35rem; white-space: nowrap; }
  .pipelineStep > span { color: var(--color-label); font-size: 1.5rem; font-weight: 700; }
  .modelSelect { min-width: 11rem; }
  .chapterNavigation { align-items: center; display: grid; gap: 0.5rem; grid-template-columns: auto minmax(14rem, 1fr) minmax(8rem, 1fr) auto auto; margin-bottom: 1rem; }
  .chapterEditor { align-items: flex-end; display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .chapterEditor > :first-child { flex: 1; }
  .columns { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .columns > section, .singlePane { border: 1px solid var(--border-table); border-radius: 0.4rem; min-width: 0; overflow: auto; padding: 1rem; }
  .contentCard { border-bottom: 1px solid var(--border-table); box-sizing: border-box; min-width: 0; padding: 0.75rem 5rem 0.75rem 10px; position: relative; }
  .contentCard > .ui--Button { position: absolute; right: 10px; top: 10px; }
  .contentCard > strong { display: block; overflow-wrap: anywhere; }
  .fixReviewList { max-height: 60vh; overflow: auto; }
  .fixReviewItem { border-top: 1px solid var(--border-table); padding: 0.75rem 0; }
  .fixReviewItem:first-child { border-top: 0; }
  .fixReviewItem p { margin: 0.35rem 0; }
  .fixReviewItem h5 { margin: 0.75rem 0 0.35rem; }
  .fixReviewItem ul { margin: 0.5rem 0 0; padding-left: 1.4rem; }
  .fixedAbilityPreview { border-left: 3px solid var(--border-table); padding-left: 0.75rem; }
  .duplicateReviewList { max-height: 60vh; overflow: auto; }
  .duplicateReviewItem { border-top: 1px solid var(--border-table); padding: 0.9rem 0; }
  .duplicateReviewItem:first-child { border-top: 0; }
  .duplicatePairComparison { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0.6rem; }
  .duplicateAbilitySide { border: 1px solid var(--border-table); border-radius: 0.4rem; min-width: 0; padding: 0.75rem; }
  .duplicateAbilitySide h5 { margin: 0 0 0.5rem; }
  .duplicateAbilitySide p { margin: 0.35rem 0; overflow-wrap: anywhere; }
  .duplicateAbilitySide > strong { display: block; margin: 0.5rem 0; overflow-wrap: anywhere; }
  .duplicateAbilitySide pre { max-height: 12rem; overflow: auto; white-space: pre-wrap; }
  .abilitiesPane { width: 100%; }
  .exerciseWithAbilities + .exerciseWithAbilities { border-top: 1px solid var(--border-table); margin-top: 1rem; padding-top: 0.5rem; }
  .matchedAbilities { border-left: 3px solid var(--border-table); margin: 0 0 0.75rem 1.5rem; padding-left: 0.75rem; }
  .matchedAbilities .contentCard { background: var(--bg-input); }
  .matchedAbilities .contentCard:last-child { border-bottom: 0; }
  .noAbility { color: var(--color-label); margin: 0; padding: 0.75rem 0; }
  .unmatchedAbilities { border-top: 1px solid var(--border-table); margin-top: 1rem; padding-top: 1rem; }
  .contentCard p { margin: 0.35rem 0; }
  .contentCard .solution { border-left: 0.2rem solid var(--border-table); margin: 0.5rem 0; padding-left: 0.75rem; }
  .exerciseImage { border: 1px solid var(--border-table); border-radius: 0.35rem; display: block; max-height: 18rem; max-width: min(100%, 32rem); object-fit: contain; }
  .processingOverlay { align-items: center; background: color-mix(in srgb, var(--bg-page) 92%, transparent); display: flex; flex-direction: column; gap: 0.75rem; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
  .errorMessage { color: #9f3a38; }
  .noticeMessage { color: var(--color-label); }
  @media only screen and (max-width: 900px) { .columns, .duplicatePairComparison { grid-template-columns: 1fr; } .chapterEditor { align-items: stretch; flex-direction: column; } }
`;

export default React.memo(Skills);
