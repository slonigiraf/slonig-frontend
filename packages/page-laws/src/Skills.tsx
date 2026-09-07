// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, Exercise, ExerciseTemplate, Skill } from '@slonigiraf/db';
import type { GeneratedAbility } from './abilities.js';

import { addExerciseTemplatesForSkill, deleteAbilities, deleteAbility, deleteBookConcept, deleteExercise, deleteExerciseTemplate, deleteSkill, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getExerciseTemplatesForSkill, getSetting, getSkillsForChapter, replaceAbilities, replaceExerciseTemplatesForSkill, replaceSkillsForChapter, SettingKey, updateBookChapterTitle, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { parseGeneratedAbilities, parseGeneratedExerciseAbilities, parseStoredAbility } from './abilities.js';
import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { abilityGenerationInstructions, divideExerciseTemplatesPrompt, fixAbilitiesPrompt, OPENAI_MODELS, skillsToExerciseTemplatesPrompt, sourcesToSkillsPrompt } from './constants.js';

const REQUEST_INTERVAL_MS = Math.ceil(60_000 / 9);
const BATCH_SIZE = 5;
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export type SkillsView = 'conceptsSkills' | 'preExercisesExercises' | 'skillsPreExercises';

interface Props {
  book: Book;
  onBookChange: (book: Book) => void;
  onAction?: (view: SkillsView) => void;
  pipelineOnly?: boolean;
  pipelinePrefix?: React.ReactNode;
  showPipeline?: boolean;
  view: SkillsView;
}

interface StoredAbility {
  ability: GeneratedAbility;
  content: string;
  id: string;
  moduleId: string;
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

async function requestValidatedJson<T> (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, parse: (content: string) => T, jsonObject = true): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.chat.completions.create({
      messages: [{ content: systemPrompt, role: 'system' }, { content: userPrompt, role: 'user' }],
      model,
      ...(jsonObject ? { response_format: { type: 'json_object' as const } } : {})
    });
    const candidate = response.choices[0].message?.content?.trim() ?? '';
    const validationPrompt = `Act as an independent strict validator. Check the candidate against every original requirement and the supplied input. Fix every factual, structural, language, completeness, ordering, KaTeX, and count error. If it cannot be repaired safely, regenerate the complete output from the original request. Return only the final corrected output in the exact originally requested JSON shape, without commentary.\n\nORIGINAL REQUEST:\n${userPrompt}\n\nCANDIDATE OUTPUT:\n${candidate}`;

    try {
      const validation = await client.chat.completions.create({
        messages: [{ content: systemPrompt, role: 'system' }, { content: validationPrompt, role: 'user' }],
        model,
        ...(jsonObject ? { response_format: { type: 'json_object' as const } } : {})
      });

      return parse(validation.choices[0].message?.content?.trim() ?? '');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI output failed validation twice.');
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

function BookItem ({ abilityMode, description, id, onDeleted, onError, solution, title, type }: { abilityMode?: Exercise['abilityMode']; description: string; id?: number; onDeleted: () => void; onError: (message: string) => void; solution?: string; title: string; type: 'concept' | 'exercise' }): React.ReactElement {
  const remove = useCallback((): void => {
    if (id === undefined) {
      return;
    }

    (type === 'concept' ? deleteBookConcept(id) : deleteExercise(id)).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : `Unable to delete the ${type}.`));
  }, [id, onDeleted, onError, type]);

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
    <strong><KatexSpan content={record.ability.h} /></strong>
    <ExerciseList
      areShownInitially
      exercises={record.ability.q}
      location='ability_info'
    />
    <Button
      icon='trash'
      onClick={remove}
    />
  </article>;
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

function Skills ({ book, onAction, onBookChange, pipelineOnly = false, pipelinePrefix, showPipeline = true, view }: Props): React.ReactElement {
  const language = book.language ?? 'en';
  const [aiAction, setAiAction] = useState<AiAction>();
  const [chapterContent, setChapterContent] = useState<ChapterContent[]>([]);
  const [chapterIndex, setChapterIndex] = useState(() => getSessionChapter(book.id, view));
  const [error, setError] = useState('');
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
        const abilities = records.flatMap(({ content, id, moduleId }): StoredAbility[] => {
          try {
            return [{ ability: parseStoredAbility(content), content, id, moduleId }];
          } catch {
            return [];
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
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined ? [] : [...concepts.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'concept' as const, title }]), ...exercises.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'exercise' as const, title }])]), [chapterContent]);
  const inferredStage = allAbilities.length ? 7 : allExercises.length ? 3 : skillSources.length ? 2 : book.processingStage ?? 0;
  const stage = Math.max(book.processingStage ?? 0, inferredStage);
  const storedExerciseCount = allExercises.filter(({ id }) => id !== undefined).length;
  const hasCompleteAbilities = storedExerciseCount > 0 && allAbilities.length >= storedExerciseCount;

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

    return new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1', dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' } });
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
      return chapterContent.flatMap(({ abilities, chapter }) => Array.from({ length: Math.ceil(abilities.length / BATCH_SIZE) }, (_, index) => `${fixAbilitiesPrompt}\n${chapter.title}\n${JSON.stringify(abilities.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE).map(({ ability }) => ability))}`));
    }

    return [];
  }, [aiAction, allExercises, allSkillBlocks, chapterContent, language, skillSources]);
  const generationOutputTokens = aiAction === 'preExercises' || aiAction === 'dividePreExercises' ? BATCH_SIZE * 1_250 : aiAction === 'exercises' ? Math.max(1, allExercises.length) * 700 : aiAction === 'fix' ? BATCH_SIZE * 700 : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const validationInputs = useMemo(() => aiAction === 'exercises'
    ? requestInputs.flatMap((input) => [input, input, input])
    : requestInputs.flatMap((input) => [input, `Validate and repair this response against the original request:\n${input}`]), [aiAction, requestInputs]);
  const outputTokens = generationOutputTokens;
  const estimate = formatAiInputEstimate(estimateAiInput(selectedModel, validationInputs, outputTokens));
  const iconForStage = useCallback((requiredStage: number): 'play' | 'rotate-left' => stage >= requiredStage ? 'rotate-left' : 'play', [stage]);

  const beginProgress = useCallback((label: string, total: number): void => {
    setAiAction(undefined); setError(''); setIsBusy(true); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));
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

      if (!pending.size) {
        await setStage(7);
      }

      refresh();

      if (pending.size) {
        const unresolved = Array.from(pending.values()).map(({ id, title }) => `${id}: ${title}`).join('; ');

        setError(`Generated ${generatedByExerciseId.size} of ${allExercises.length} Abilities. ${pending.size} Exercise${pending.size === 1 ? '' : 's'} remained unconverted after ${maxAttempts} attempts and were left unchanged: ${unresolved}${lastAttemptError ? `. Last attempt: ${lastAttemptError}` : ''}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate Abilities.');
    } finally {
      setIsBusy(false);
    }
  }, [allExercises, beginProgress, book.id, createClient, language, refresh, selectedModel, setStage]);

  const fixExercises = useCallback(async (): Promise<void> => {
    beginProgress('Fixing Ability errors', allAbilities.length);

    try {
      const client = await createClient();

      let completed = 0;
      const correctedByModule = new Map<string, string[]>();

      for (const { abilities } of chapterContent) {
        for (let start = 0; start < abilities.length; start += BATCH_SIZE) {
          const batch = abilities.slice(start, start + BATCH_SIZE);

          if (completed) {
            await delay(REQUEST_INTERVAL_MS);
          }

          const systemPrompt = `Keep ISO language ${language}.`;
          const userPrompt = `${fixAbilitiesPrompt}\n${JSON.stringify(batch.map(({ ability }) => ability))}`;
          const corrected = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseGeneratedAbilities(content, batch.length), false);

          batch.forEach(({ moduleId }, index) => {
            const contents = correctedByModule.get(moduleId) ?? [];

            contents.push(JSON.stringify(corrected[index]));
            correctedByModule.set(moduleId, contents);
          });
          completed += batch.length; setProgress(completed);
        }
      }

      await Promise.all(Array.from(correctedByModule, ([moduleId, contents]) => replaceAbilities(moduleId, contents)));
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix Ability errors.');
    } finally {
      setIsBusy(false);
    }
  }, [allAbilities.length, beginProgress, chapterContent, createClient, language, refresh, selectedModel]);

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
  const openExerciseGeneration = useCallback((): void => {
    setAiAction('exercises'); onAction?.('preExercisesExercises');
  }, [onAction]);
  const openExerciseFix = useCallback((): void => {
    setAiAction('fix'); onAction?.('preExercisesExercises');
  }, [onAction]);

  return <StyledSkills className={pipelineOnly ? 'pipelineOnly' : undefined}>
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
        label='Generate Exercises'
        onClick={openExerciseGeneration}
                                                   /></span>
      <span className='pipelineStep'><span>›</span><Button
        icon={stage >= 7 ? 'rotate-left' : 'play'}
        isDisabled={isBusy || stage < 7 || !hasCompleteAbilities}
        label='Fix exercise errors'
        onClick={openExerciseFix}
                                                   /></span>
    </div>}
    {error && <p
      className='errorMessage'
      role='alert'
              >{error}</p>}
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
            <div className='columns'>
              <section>
                <h3>Exercises</h3>
                {!current.exercises.length && <p>No Exercises in this chapter.</p>}
                {current.exercises.map((exercise) => <BookItem
                  abilityMode={exercise.abilityMode}
                  description={exercise.description}
                  id={exercise.id}
                  key={`exercise-${exercise.id ?? 'new'}`}
                  onDeleted={refresh}
                  onError={setError}
                  solution={exercise.solution}
                  title={exercise.title}
                  type='exercise'
                                                      />)}
              </section>
              <section>
                <h3>Abilities</h3>
                {!current.abilities.length && <p>No Abilities generated.</p>}
                {current.abilities.map((record) => <AbilityCard
                  key={record.id}
                  onDeleted={refresh}
                  onError={setError}
                  record={record}
                                                   />)}
              </section>
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
  .skillWithTemplates + .skillWithTemplates { border-top: 1px solid var(--border-table); margin-top: 0.75rem; padding-top: 0.5rem; }
  .skillWithTemplates .contentCard + .contentCard { border-left: 3px solid var(--border-table); margin-left: 1.5rem; }
  .contentCard p { margin: 0.35rem 0; }
  .contentCard .solution { border-left: 0.2rem solid var(--border-table); margin: 0.5rem 0; padding-left: 0.75rem; }
  .processingOverlay { align-items: center; background: color-mix(in srgb, var(--bg-page) 92%, transparent); display: flex; flex-direction: column; gap: 0.75rem; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
  .errorMessage { color: #9f3a38; }
  @media only screen and (max-width: 900px) { .columns { grid-template-columns: 1fr; } .chapterEditor { align-items: stretch; flex-direction: column; } }
`;

export default React.memo(Skills);
