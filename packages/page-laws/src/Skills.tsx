// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, Exercise, ExerciseTemplate, Skill } from '@slonigiraf/db';
import type { GeneratedAbility } from './abilities.js';

import { addExerciseTemplatesForSkill, deleteAbilities, deleteAbility, deleteBookConcept, deleteExercise, deleteExerciseTemplate, deleteSkill, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getExerciseTemplatesForSkill, getSetting, getSkillsForChapter, replaceAbilities, replaceExerciseTemplatesForSkill, replaceSkillsForChapter, SettingKey, storeAbility, updateBookChapterTitle, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { parseAbilityRepairResult, parseGeneratedAbilities, parseGeneratedExerciseAbilities, parseStoredAbility } from './abilities.js';
import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { abilityGenerationInstructions, divideExerciseTemplatesPrompt, fixAbilitiesPrompt, OPENAI_MODELS, skillsToExerciseTemplatesPrompt, sourcesToSkillsPrompt } from './constants.js';

const REQUEST_INTERVAL_MS = Math.ceil(60_000 / 9);
const BATCH_SIZE = 5;
const FIX_CONCURRENCY = 3;
const MAX_REQUEST_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1_000;
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface RequestGate {
  pause: (milliseconds: number) => void;
  run: <T>(request: () => Promise<T>) => Promise<T>;
}

function createRequestGate (maxConcurrent: number): RequestGate {
  let active = 0;
  let pauseUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    if (active >= maxConcurrent || !queue.length) {
      return;
    }

    const wait = pauseUntil - Date.now();

    if (wait > 0) {
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          pump();
        }, wait);
      }

      return;
    }

    while (active < maxConcurrent && queue.length) {
      const start = queue.shift();

      if (!start) {
        break;
      }

      active++;
      start();
    }
  };

  return {
    pause: (milliseconds): void => {
      pauseUntil = Math.max(pauseUntil, Date.now() + Math.max(0, milliseconds));

      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      pump();
    },
    run: <T,>(request: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(request)
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    })
  };
}

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

async function requestChatContent (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, jsonObject: boolean, requestGate?: RequestGate): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
    try {
      const makeRequest = () => client.chat.completions.create({
        messages: [{ content: systemPrompt, role: 'system' as const }, { content: userPrompt, role: 'user' as const }],
        model,
        ...(jsonObject ? { response_format: { type: 'json_object' as const } } : {})
      });
      const response = requestGate ? await requestGate.run(makeRequest) : await makeRequest();

      return response.choices[0].message?.content?.trim() ?? '';
    } catch (error) {
      lastError = error;

      if (!isRetryableRequestError(error) || attempt === MAX_REQUEST_ATTEMPTS - 1) {
        throw error;
      }

      const retryAfter = getRetryAfterMs(error);
      const backoff = retryAfter ?? RETRY_BASE_DELAY_MS * (2 ** attempt);

      requestGate?.pause(backoff);
      await delay(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed after retries.');
}

export type SkillsView = 'conceptsSkills' | 'preExercisesExercises' | 'skillsPreExercises';

interface Props {
  book: Book;
  onBookChange: (book: Book) => void;
  onAction?: (view: SkillsView) => void;
  onEntityCountsChange?: (counts: { abilities: number; exercises: number }) => void;
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

interface ChapterContent {
  chapter: BookChapter;
  concepts: BookConcept[];
  exerciseTemplates: ExerciseTemplate[];
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

interface SkillBlock {
  concepts: BookConcept[];
  exampleExercises: Exercise[];
  skill: Skill & { id: number };
}


type AiAction = 'dividePreExercises' | 'exercises' | 'fix' | 'preExercises' | 'skills';

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

function parseExerciseTemplates (content: string, expectedSkillIds: number[], requireCoverage = true, expectedCount?: number): ExerciseTemplate[] {
  const parsed = parseJson(content);
  const values = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object'
      ? (parsed as { exerciseTemplates?: unknown; templates?: unknown }).templates ?? (parsed as { exerciseTemplates?: unknown }).exerciseTemplates
      : undefined;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid exercise-template data.');
  }

  const templates = values as Array<Partial<ExerciseTemplate>>;
  const invalidIndex = templates.findIndex((template) => template === null || typeof template !== 'object' || !Number.isSafeInteger(template.skillId) || !expectedSkillIds.includes(template.skillId as number) || typeof template.text !== 'string' || !template.text.trim() || typeof template.solution !== 'string' || !template.solution.trim());

  if (invalidIndex !== -1) {
    throw new Error(`OpenRouter returned invalid fields or an unexpected skillId in ExerciseTemplate ${invalidIndex + 1}.`);
  }

  const missingSkillIds = requireCoverage ? expectedSkillIds.filter((id) => !templates.some(({ skillId }) => skillId === id)) : [];

  if (missingSkillIds.length) {
    throw new Error(`OpenRouter omitted ExerciseTemplates for Skill IDs: ${missingSkillIds.join(', ')}.`);
  }

  if (expectedCount !== undefined && templates.length !== expectedCount) {
    throw new Error(`OpenRouter returned ${templates.length} ExerciseTemplates; expected ${expectedCount}.`);
  }

  return templates.map(({ skillId = 0, solution = '', text = '' }) => ({ skillId, solution: solution.trim(), text: text.trim() }));
}

function parseGeneratedExerciseTemplates (content: string, expectedSkillIds: number[]): ExerciseTemplate[] {
  const templates = parseExerciseTemplates(content, expectedSkillIds, true, expectedSkillIds.length);

  if (templates.some(({ skillId }, index) => skillId !== expectedSkillIds[index])) {
    throw new Error('OpenRouter did not return exactly one ExerciseTemplate per Skill in the supplied order.');
  }

  return templates;
}

function createSkillBlocks (skills: Skill[], concepts: BookConcept[], exercises: Exercise[]): SkillBlock[] {
  return skills.flatMap((skill) => skill.id === undefined
    ? []
    : [{
      concepts: concepts.filter(({ id }) => id !== undefined && (skill.bookConceptIds ?? []).includes(id)),
      exampleExercises: exercises.filter(({ id }) => id !== undefined && (skill.exerciseIds ?? []).includes(id)),
      skill: skill as Skill & { id: number }
    }]);
}

function exerciseTemplatesRequest (language: string, blocks: SkillBlock[]): string {
  return `${skillsToExerciseTemplatesPrompt}\n${JSON.stringify({ blocks, bookLanguage: language })}`;
}

function exerciseAbilitiesRequest (language: string, exercises: Exercise[]): string {
  return `${abilityGenerationInstructions}

Convert every supplied book Exercise you can into exactly one Ability. Treat each source Exercise as evidence for one narrow human skill. Do not merge exercises or generate more than one Ability for a source Exercise. Use the source task and solution to identify the skill, then create the required pair of concrete practice exercises for that same skill. Write strictly in ISO language ${language}.

For this Exercise-to-Ability conversion request only, wrap each completed Ability with the source Exercise id. This transport wrapper overrides the bare-array transport format above; the nested Ability object itself must still contain only i, t, h, and q exactly as specified above. Return only valid JSON in this shape:
{"abilities":[{"exerciseId":123,"ability":{"i":"","t":3,"h":"Narrow observable skill","q":[{"h":"Question 1","a":"Answer 1","p":"","i":""},{"h":"Question 2","a":"Answer 2","p":"","i":""}]}}]}
Use only ids present in the supplied Exercises. Preserve their order. Prefer converting every Exercise, but if the response cannot fit all conversions, return every complete conversion you can and omit the rest rather than truncating or corrupting an Ability. Omitted Exercises will be retried automatically.

${JSON.stringify({ bookLanguage: language, exercises })}`;
}

function abilityRepairRequest (language: string, batch: StoredAbility[], chapterTitle?: string): string {
  return `${fixAbilitiesPrompt}\n${JSON.stringify({
    abilities: batch.map(({ ability, content, id }, index) => ({ ability: ability ?? content, id, index })),
    bookLanguage: language,
    ...(chapterTitle ? { chapterTitle } : {})
  })}`;
}

async function requestValidatedJson<T> (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, parse: (content: string) => T, jsonObject = true, requestGate?: RequestGate): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = await requestChatContent(client, model, systemPrompt, userPrompt, jsonObject, requestGate);

    try {
      // The parser is the fast local validation gate. In the normal case this
      // avoids the old unconditional second model call entirely.
      return parse(candidate);
    } catch (error) {
      lastError = error;
    }

    const validationPrompt = `Act as an independent strict validator. Check the candidate against every original requirement and the supplied input. Fix every factual, structural, language, completeness, ordering, KaTeX, and count error. If it cannot be repaired safely, regenerate the complete output from the original request. Return only the final corrected output in the exact originally requested JSON shape, without commentary.\n\nORIGINAL REQUEST:\n${userPrompt}\n\nCANDIDATE OUTPUT:\n${candidate}`;

    try {
      const repaired = await requestChatContent(client, model, systemPrompt, validationPrompt, jsonObject, requestGate);

      return parse(repaired);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI output failed local validation and repair twice.');
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

function BookItem ({ abilityMode, description, id, onDelete, onDeleted, onError, solution, title, type }: { abilityMode?: Exercise['abilityMode']; description: string; id?: number; onDelete: (id: number) => Promise<void>; onDeleted: () => void; onError: (message: string) => void; solution?: string; title: string; type: 'concept' | 'exercise' }): React.ReactElement {
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
    {solution && <p><KatexSpan content={solution} /></p>}
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

function PreExerciseCard ({ onDeleted, onError, template }: { onDeleted: () => void; onError: (message: string) => void; template: ExerciseTemplate }): React.ReactElement {
  const remove = useCallback((): void => {
    if (template.id === undefined) {
      return;
    }

    deleteExerciseTemplate(template.id).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the ExerciseTemplate.'));
  }, [onDeleted, onError, template.id]);

  return <article className='contentCard'>
    <p><KatexSpan content={template.text} /></p>
    <div className='solution'><KatexSpan content={template.solution} /></div>
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
  const [chapterIndex, setChapterIndex] = useState(() => getSessionChapter(book.id, view));
  const [error, setError] = useState('');
  const [fixReview, setFixReview] = useState<FixReviewResult | null>(null);
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
      const pageRows = await Promise.all(pages.map(async (page: BookPage) => ({ concepts: await getBookConceptsForBookPage(book.id, page.pageNumber), exercises: await getExercisesForBookPage([book.id, page.pageNumber]), page })));
      const result = await Promise.all(chapters.map(async (chapter): Promise<ChapterContent> => {
        const skills = chapter.id === undefined ? [] : await getSkillsForChapter(chapter.id);
        const matchingPages = pageRows.filter(({ concepts, page }) => page.chapter === chapter.title || concepts.some(({ chapterId }) => chapterId === chapter.id));
        const exercises = matchingPages.flatMap(({ exercises }) => exercises);
        const exerciseTemplates = (await Promise.all(skills.flatMap(({ id }) => id === undefined ? [] : [getExerciseTemplatesForSkill(id)]))).flat();
        const records = (await Promise.all(exercises.flatMap(({ id }) => id === undefined ? [] : [getAbilities(exerciseAbilityModuleId(book.id, id))]))).flat() as Array<{ content: string; id: string; moduleId: string }>;
        const abilities = records.map(({ content, id, moduleId }): StoredAbility => {
          try {
            return { ability: parseStoredAbility(content), content, id, moduleId };
          } catch {
            return { ability: null, content, id, moduleId };
          }
        });

        return { abilities, chapter, concepts: matchingPages.flatMap(({ concepts }) => concepts.filter(({ chapterId }) => chapterId === chapter.id)), exercises, exerciseTemplates, skills };
      }));

      if (active) {
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
  const allSkillBlocks = useMemo(() => chapterContent.flatMap(({ concepts, exercises, skills }) => createSkillBlocks(skills, concepts, exercises)), [chapterContent]);
  const allExercises = useMemo(() => chapterContent.flatMap(({ exercises }) => exercises), [chapterContent]);
  const allAbilities = useMemo(() => chapterContent.flatMap(({ abilities }) => abilities), [chapterContent]);

  useEffect(() => {
    onEntityCountsChange?.({ abilities: allAbilities.length, exercises: allExercises.length });
  }, [allAbilities.length, allExercises.length, onEntityCountsChange]);
  const exerciseTitlesByModuleId = useMemo(() => new Map(allExercises.flatMap(({ id, title }) => id === undefined ? [] : [[exerciseAbilityModuleId(book.id, id), title] as const])), [allExercises, book.id]);
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined ? [] : [...concepts.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'concept' as const, title }]), ...exercises.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'exercise' as const, title }])]), [chapterContent]);
  // Pipeline buttons must follow the persisted processing stage, not the
  // presence of generated/extracted rows. Concepts can already extract
  // exercises from the source book, but that does not mean the Exercises
  // pipeline step has been run. Stage 3 is set explicitly only when that
  // step completes, and only then should Abilities become available.
  const stage = book.processingStage ?? 0;
  const hasAbilities = allAbilities.length > 0;

  const setStage = useCallback(async (processingStage: number): Promise<void> => {
    const updated = await updateBookProcessingStage(book.id, processingStage);

    if (updated) {
      onBookChange(updated);
    }
  }, [book.id, onBookChange]);

  const createClient = useCallback(async (): Promise<OpenAI> => {
    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('No OpenRouter token found. Add it in Settings.');
    }

    return new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1', dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }, maxRetries: 0 });
  }, []);

  const requestInputs = useMemo((): string[] => {
    if (aiAction === 'skills') {
      return Array.from({ length: Math.ceil(skillSources.length / BATCH_SIZE) }, (_, index) => `${sourcesToSkillsPrompt}\n${language}\n${JSON.stringify(skillSources.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE))}`);
    }

    if (aiAction === 'preExercises') {
      return Array.from({ length: Math.ceil(allSkillBlocks.length / BATCH_SIZE) }, (_, index) => exerciseTemplatesRequest(language, allSkillBlocks.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)));
    }

    if (aiAction === 'dividePreExercises') {
      return chapterContent.flatMap(({ chapter, concepts, exerciseTemplates, exercises, skills }) => {
        const blocks = createSkillBlocks(skills, concepts, exercises);

        return Array.from({ length: Math.ceil(blocks.length / BATCH_SIZE) }, (_, index) => {
          const batch = blocks.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE);
          const skillIds = batch.map(({ skill }) => skill.id);

          return `${divideExerciseTemplatesPrompt}\nChapter: ${chapter.title}\n${JSON.stringify({ blocks: batch, templates: exerciseTemplates.filter(({ skillId }) => skillIds.includes(skillId)) })}`;
        });
      });
    }

    if (aiAction === 'exercises') {
      return allExercises.length ? [exerciseAbilitiesRequest(language, allExercises)] : [];
    }

    if (aiAction === 'fix') {
      return chapterContent.filter(({ abilities }) => abilities.length > 0).map(({ abilities, chapter }) => abilityRepairRequest(language, abilities, chapter.title));
    }

    return [];
  }, [aiAction, allExercises, allSkillBlocks, chapterContent, language, skillSources]);
  const maxChapterAbilityCount = Math.max(1, ...chapterContent.map(({ abilities }) => abilities.length));
  const generationOutputTokens = aiAction === 'preExercises' || aiAction === 'dividePreExercises' ? BATCH_SIZE * 1_250 : aiAction === 'exercises' ? Math.max(1, allExercises.length) * 700 : aiAction === 'fix' ? maxChapterAbilityCount * 700 : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const validationInputs = useMemo(() => aiAction === 'exercises'
    ? requestInputs.flatMap((input) => [input, input, input])
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
    setAiAction(undefined); setError(''); setFixReview(null); setNotice(''); setIsBusy(true); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));
  }, []);

  const generateSkills = useCallback(async (): Promise<void> => {
    beginProgress('Generating Skills', skillSources.length);

    try {
      const client = await createClient();

      const generatedByChapter = new Map<number, Array<Omit<Skill, 'chapterId' | 'id'>>>();

      for (let start = 0; start < skillSources.length; start += BATCH_SIZE) {
        const batch = skillSources.slice(start, start + BATCH_SIZE);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const systemPrompt = `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`;
        const userPrompt = `${sourcesToSkillsPrompt}\nReturn exactly ${batch.length} skills.\n${JSON.stringify(batch)}`;
        const generated = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseGeneratedSkills(content, batch.length));

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
        setProgress(Math.min(skillSources.length, start + batch.length));
      }

      await Promise.all(allSkills.flatMap(({ id }) => id === undefined ? [] : [replaceExerciseTemplatesForSkill(id, []), deleteAbilities(abilityModuleId(book.id, id))]));
      await Promise.all(chapters.flatMap(({ id }) => id === undefined ? [] : [replaceSkillsForChapter(id, generatedByChapter.get(id) ?? [])]));
      await setStage(4); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate Skills.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkills, beginProgress, book.id, chapters, createClient, language, refresh, selectedModel, setStage, skillSources]);

  const generatePreExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating ExerciseTemplates', allSkillBlocks.length);

    try {
      const client = await createClient();

      const generatedBySkill = new Map<number, Array<Omit<ExerciseTemplate, 'skillId' | 'id'>>>();

      for (let start = 0; start < allSkillBlocks.length; start += BATCH_SIZE) {
        const batch = allSkillBlocks.slice(start, start + BATCH_SIZE);
        const expectedSkillIds = batch.map(({ skill }) => skill.id);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const systemPrompt = `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`;
        const userPrompt = exerciseTemplatesRequest(language, batch);
        const generated = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseGeneratedExerciseTemplates(content, expectedSkillIds));

        expectedSkillIds.forEach((id) => generatedBySkill.set(id, generated.filter(({ skillId }) => skillId === id).map(({ solution, text }) => ({ solution, text }))));
        setProgress(Math.min(allSkillBlocks.length, start + batch.length));
      }

      const expectedSkillIds = allSkills.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (expectedSkillIds.some((id) => !generatedBySkill.get(id)?.length)) {
        throw new Error('AI did not generate a validated ExerciseTemplate for every Skill. Existing templates were preserved.');
      }

      await Promise.all(expectedSkillIds.map((id) => replaceExerciseTemplatesForSkill(id, generatedBySkill.get(id) ?? [])));
      await setStage(5); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate ExerciseTemplates.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkillBlocks, allSkills, beginProgress, createClient, language, refresh, selectedModel, setStage]);

  const dividePreExercises = useCallback(async (): Promise<void> => {
    beginProgress('Dividing multistep ExerciseTemplates', allSkillBlocks.length);

    try {
      const client = await createClient();

      let completed = 0;
      let requestIndex = 0;

      for (const { chapter, concepts, exerciseTemplates, exercises, skills } of chapterContent) {
        const blocks = createSkillBlocks(skills, concepts, exercises);

        for (let start = 0; start < blocks.length; start += BATCH_SIZE) {
          const batch = blocks.slice(start, start + BATCH_SIZE);
          const expectedSkillIds = batch.map(({ skill }) => skill.id);
          const parents = exerciseTemplates.filter(({ skillId }) => expectedSkillIds.includes(skillId));

          if (requestIndex++) {
            await delay(REQUEST_INTERVAL_MS);
          }

          const systemPrompt = `Keep ISO language ${language}. Use <kx>...</kx> for every mathematical expression.`;
          const userPrompt = `${divideExerciseTemplatesPrompt}\nChapter: ${chapter.title}\n${JSON.stringify({ blocks: batch, templates: parents })}`;
          const children = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseExerciseTemplates(content, expectedSkillIds, false));

          await Promise.all(expectedSkillIds.map((skillId) => {
            const existing = parents.filter((template) => template.skillId === skillId);
            const signatures = new Set(existing.map(({ solution, text }) => JSON.stringify([text.trim(), solution.trim()])));
            const additions = children
              .filter((template) => template.skillId === skillId)
              .filter(({ solution, text }) => {
                const signature = JSON.stringify([text, solution]);

                if (signatures.has(signature)) {
                  return false;
                }

                signatures.add(signature);

                return true;
              })
              .map(({ solution, text }) => ({ solution, text }));

            return additions.length ? addExerciseTemplatesForSkill(skillId, additions) : Promise.resolve([]);
          }));
          completed += batch.length;
          setProgress(Math.min(allSkillBlocks.length, completed));
        }
      }

      await setStage(6); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to divide ExerciseTemplates.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkillBlocks.length, beginProgress, chapterContent, createClient, language, refresh, selectedModel, setStage]);

  const generateExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating Abilities', allExercises.length);

    try {
      if (!allExercises.length) {
        throw new Error('No Exercises are available to generate Abilities from.');
      }

      if (allExercises.some(({ id }) => id === undefined)) {
        throw new Error('Every Exercise must have an id before Abilities can be generated.');
      }

      const client = await createClient();
      const pending = new Map<number, Exercise>(allExercises.map((exercise) => [exercise.id as number, exercise]));
      const generatedByExerciseId = new Map<number, GeneratedAbility>();
      const maxAttempts = 3;
      let lastAttemptError = '';

      for (let attempt = 1; attempt <= maxAttempts && pending.size; attempt++) {
        if (attempt > 1) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const exercises = Array.from(pending.values());
        const expectedExerciseIds = exercises.map(({ id }) => id as number);
        const systemPrompt = `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`;
        const userPrompt = exerciseAbilitiesRequest(language, exercises);

        try {
          const response = await client.chat.completions.create({
            messages: [{ content: systemPrompt, role: 'system' }, { content: userPrompt, role: 'user' }],
            model: selectedModel,
            response_format: { type: 'json_object' as const }
          });
          const generated = parseGeneratedExerciseAbilities(response.choices[0].message?.content?.trim() ?? '', expectedExerciseIds);

          if (!generated.length) {
            lastAttemptError = 'OpenRouter returned no valid Exercise-to-Ability conversions.';
          } else {
            lastAttemptError = '';
          }

          generated.forEach(({ ability, exerciseId }) => {
            if (!pending.has(exerciseId)) {
              return;
            }

            generatedByExerciseId.set(exerciseId, ability);
            pending.delete(exerciseId);
          });
          setProgress(generatedByExerciseId.size);
        } catch (caught) {
          lastAttemptError = caught instanceof Error ? caught.message : 'Unknown OpenRouter error.';
          // This attempt still counts. Retry the same unresolved Exercises on the next pass.
        }
      }

      await Promise.all(Array.from(generatedByExerciseId, ([exerciseId, ability]) => replaceAbilities(exerciseAbilityModuleId(book.id, exerciseId), [JSON.stringify(ability)])));

      if (generatedByExerciseId.size || allAbilities.length) {
        // Partial conversion is still a successful Ability-generation stage.
        // Unconverted Exercises remain available in the Exercises column and do not hide generated results.
        await setStage(7);
      }

      refresh();

      if (pending.size && generatedByExerciseId.size) {
        const unresolved = Array.from(pending.values()).map(({ id, title }) => `${id}: ${title}`).join('; ');

        setNotice(`Generated ${generatedByExerciseId.size} of ${allExercises.length} Abilities. ${pending.size} Exercise${pending.size === 1 ? '' : 's'} remained unconverted and were left unchanged: ${unresolved}`);
      } else if (!generatedByExerciseId.size && pending.size && allAbilities.length) {
        setNotice(`No new Abilities were generated after ${maxAttempts} attempts. The existing ${allAbilities.length} Abilit${allAbilities.length === 1 ? 'y remains' : 'ies remain'} available; unconverted Exercises were left unchanged.`);
      } else if (!generatedByExerciseId.size && pending.size) {
        const suffix = lastAttemptError ? ` Last attempt: ${lastAttemptError}` : '';

        setError(`No Abilities were generated after ${maxAttempts} attempts.${suffix}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate Abilities.');
    } finally {
      setIsBusy(false);
    }
  }, [allAbilities.length, allExercises, beginProgress, book.id, createClient, language, refresh, selectedModel, setStage]);

  const fixExercises = useCallback(async (): Promise<void> => {
    beginProgress('Fixing Ability errors', allAbilities.length);

    try {
      const client = await createClient();
      const requestGate = createRequestGate(FIX_CONCURRENCY);
      const replacements = new Map<string, { ability: GeneratedAbility; errors: string[]; record: StoredAbility }>();
      const duplicatePairs = new Map<string, DuplicateAbilityReview>();
      // Duplicate detection needs complete chapter context, so every chapter is
      // one AI request. Different chapters may still be reviewed concurrently.
      const batches = chapterContent
        .filter(({ abilities }) => abilities.length > 0)
        .map(({ abilities, chapter }) => ({ batch: abilities, chapterTitle: chapter.title }));
      let completed = 0;
      let nextBatch = 0;
      let workerError: unknown;

      const worker = async (): Promise<void> => {
        while (workerError === undefined) {
          const batchIndex = nextBatch++;

          if (batchIndex >= batches.length) {
            return;
          }

          const { batch, chapterTitle } = batches[batchIndex];
          const systemPrompt = `Keep ISO language ${language}. Return only the requested JSON object.`;
          const userPrompt = abilityRepairRequest(language, batch, chapterTitle);

          try {
            const result = await requestValidatedJson(
              client,
              selectedModel,
              systemPrompt,
              userPrompt,
              (content) => parseAbilityRepairResult(content, batch.map(({ ability }) => ability), batch.map(({ id }) => id)),
              true,
              requestGate
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
          } catch (error) {
            workerError ??= error;
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(FIX_CONCURRENCY, batches.length) }, () => worker()));

      if (workerError !== undefined) {
        throw workerError;
      }

      // Preserve the existing all-or-nothing review phase: no Ability is
      // persisted or deleted until every chapter reply has completed successfully.
      const duplicateIds = new Set(duplicatePairs.keys());
      const persistedRecordIds = new Map<string, string>();

      duplicateIds.forEach((id) => replacements.delete(id));

      for (const { ability, record } of replacements.values()) {
        const newRecordId = await storeAbility(record.moduleId, JSON.stringify(ability));

        persistedRecordIds.set(record.id, newRecordId);

        if (newRecordId !== record.id) {
          await deleteAbility(record.id);
        }
      }

      for (const id of duplicateIds) {
        await deleteAbility(id);
      }

      setFixReview({
        checked: allAbilities.length,
        duplicatePairs: Array.from(duplicatePairs.values(), (pair) => {
          const keptReplacement = replacements.get(pair.kept.id);
          const keptRecordId = persistedRecordIds.get(pair.kept.id) ?? pair.kept.id;

          return keptReplacement
            ? { ...pair, kept: { ...pair.kept, ability: keptReplacement.ability, content: JSON.stringify(keptReplacement.ability), id: keptRecordId } }
            : pair;
        }),
        items: Array.from(replacements.values(), ({ ability, errors, record }) => ({
          ability,
          errors,
          exerciseTitle: exerciseTitlesByModuleId.get(record.moduleId),
          recordId: record.id
        }))
      });
      const unchanged = Math.max(0, allAbilities.length - replacements.size - duplicateIds.size);

      setNotice(`Checked ${allAbilities.length} Abilities. Fixed ${replacements.size} with errors and deleted ${duplicateIds.size} duplicate${duplicateIds.size === 1 ? '' : 's'}; ${unchanged} were left unchanged.`);
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

    if (aiAction === 'preExercises') {
      generatePreExercises().catch(console.error);
    }

    if (aiAction === 'dividePreExercises') {
      dividePreExercises().catch(console.error);
    }

    if (aiAction === 'exercises') {
      generateExercises().catch(console.error);
    }

    if (aiAction === 'fix') {
      fixExercises().catch(console.error);
    }
  }, [aiAction, dividePreExercises, fixExercises, generateExercises, generatePreExercises, generateSkills]);
  const closeConfirmation = useCallback((): void => setAiAction(undefined), []);
  const closeFixReview = useCallback((): void => {
    setFixReview(null);
    refresh();
  }, [refresh]);
  const openExerciseGeneration = useCallback((): void => {
    setAiAction('exercises'); onAction?.('preExercisesExercises');
  }, [onAction]);
  const openExerciseFix = useCallback((): void => {
    setAiAction('fix'); onAction?.('preExercisesExercises');
  }, [onAction]);

  return <StyledSkills className={pipelineOnly ? 'pipelineOnly' : undefined}>
    {fixReview && (
      <Modal
        header='Fix abilities results'
        onClose={closeFixReview}
        size='large'
      >
        <Modal.Content>
          <p>Checked {fixReview.checked} Abilities. Corrected {fixReview.items.length} with errors and deleted {fixReview.duplicatePairs.length} duplicate{fixReview.duplicatePairs.length === 1 ? '' : 's'}.</p>
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
              icon='check'
              label='Close'
              onClick={closeFixReview}
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
        icon={iconForStage(7)}
        isDisabled={isBusy || stage < 3 || !allExercises.length}
        label='Abilities'
        onClick={openExerciseGeneration}
                                                   /></span>
      <span className='pipelineStep'><span>›</span><Button
        icon={stage >= 7 ? 'rotate-left' : 'play'}
        isDisabled={isBusy || stage < 7 || !hasAbilities}
        label='Fix abilities'
        onClick={openExerciseFix}
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
                    description={exercise.description}
                    id={exercise.id}
                    key={`exercise-${exercise.id ?? 'new'}`}
                    onDelete={deleteExerciseWithAbilities}
                    onDeleted={refresh}
                    onError={setError}
                    solution={exercise.solution}
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
          {view === 'skillsPreExercises' && (
            <div className='singlePane'>
              {!current.skills.length && <p>No Skills generated.</p>}
              {current.skills.map((skill) => <div
                className='skillWithTemplates'
                key={skill.id}
                                             >
                <SkillCard
                  bookId={book.id}
                  onDeleted={refresh}
                  onError={setError}
                  skill={skill}
                />
                {current.exerciseTemplates.filter(({ skillId }) => skillId === skill.id).map((template) => <PreExerciseCard
                  key={template.id}
                  onDeleted={refresh}
                  onError={setError}
                  template={template}
                                                                                                           />)}
              </div>)}
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
                    description={exercise.description}
                    id={exercise.id}
                    onDelete={deleteExerciseWithAbilities}
                    onDeleted={refresh}
                    onError={setError}
                    solution={exercise.solution}
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
  .skillWithTemplates + .skillWithTemplates { border-top: 1px solid var(--border-table); margin-top: 0.75rem; padding-top: 0.5rem; }
  .skillWithTemplates .contentCard + .contentCard { border-left: 3px solid var(--border-table); margin-left: 1.5rem; }
  .abilitiesPane { width: 100%; }
  .exerciseWithAbilities + .exerciseWithAbilities { border-top: 1px solid var(--border-table); margin-top: 1rem; padding-top: 0.5rem; }
  .matchedAbilities { border-left: 3px solid var(--border-table); margin: 0 0 0.75rem 1.5rem; padding-left: 0.75rem; }
  .matchedAbilities .contentCard { background: var(--bg-input); }
  .matchedAbilities .contentCard:last-child { border-bottom: 0; }
  .noAbility { color: var(--color-label); margin: 0; padding: 0.75rem 0; }
  .unmatchedAbilities { border-top: 1px solid var(--border-table); margin-top: 1rem; padding-top: 1rem; }
  .contentCard p { margin: 0.35rem 0; }
  .contentCard .solution { border-left: 0.2rem solid var(--border-table); margin: 0.5rem 0; padding-left: 0.75rem; }
  .processingOverlay { align-items: center; background: color-mix(in srgb, var(--bg-page) 92%, transparent); display: flex; flex-direction: column; gap: 0.75rem; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
  .errorMessage { color: #9f3a38; }
  .noticeMessage { color: var(--color-label); }
  @media only screen and (max-width: 900px) { .columns, .duplicatePairComparison { grid-template-columns: 1fr; } .chapterEditor { align-items: stretch; flex-direction: column; } }
`;

export default React.memo(Skills);
