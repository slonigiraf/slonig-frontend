// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookExercise, BookPage, BookSkill, ExerciseTemplate } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { addExerciseTemplatesForBookSkill, deleteAndRankBookSkills, deleteBookConcept, deleteBookExercise, deleteBookSkill, deleteExerciseTemplate, deleteSkillTemplate, deleteSkillTemplates, getBookChapters, getBookConceptsForBookPage, getBookExercisesForBookPage, getBookPages, getBookSkillsForChapter, getExerciseTemplatesForBookSkill, getSetting, getSkillTemplates, replaceBookSkillsForChapter, replaceExerciseTemplatesForBookSkill, replaceSkillTemplates, SettingKey, updateBookChapterTitle, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { assertOpenRouterCredits, estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { deduplicateAndSortSkillsPrompt, divideExerciseTemplatesPrompt, fixExerciseTemplatesPrompt, fixSkillTemplatesPrompt, OPENAI_MODELS, skillsToExercisesPrompt, skillsToExerciseTemplatesPrompt, sourcesToSkillsPrompt } from './constants.js';
import { parseGeneratedSkillTemplates, parseStoredSkillTemplate } from './skillTemplates.js';

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

interface StoredSkillTemplate {
  content: string;
  id: string;
  moduleId: string;
  template: GeneratedSkillTemplate;
}

interface ChapterContent {
  chapter: BookChapter;
  concepts: BookConcept[];
  exerciseTemplates: ExerciseTemplate[];
  exercises: BookExercise[];
  skillTemplates: StoredSkillTemplate[];
  skills: BookSkill[];
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
  bookConcepts: BookConcept[];
  bookExercises: BookExercise[];
  bookSkill: BookSkill & { id: number };
}

type AiAction = 'dividePreExercises' | 'exercises' | 'fix' | 'fixPreExercises' | 'organize' | 'preExercises' | 'skills';

const skillTemplateModuleId = (bookId: number, bookSkillId: number): string => `book-${bookId}-skill-${bookSkillId}`;

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

  const skills = values as Array<Partial<BookSkill>>;

  if (skills.length !== expectedCount || skills.some(({ description, title }) => typeof title !== 'string' || !title.trim() || typeof description !== 'string')) {
    throw new Error(`OpenRouter returned ${skills.length} skills for ${expectedCount} source items.`);
  }

  return skills.map(({ description = '', title = '' }) => ({ description: description.trim(), title: title.trim() }));
}

function parseSkillOrganization (content: string, expectedIds: number[]): { deleteIds: number[]; mergeInto: Array<{ deleteId: number; keepId: number }>; sortedIds: number[] } {
  const parsed = parseJson(content) as { deleteIds?: unknown; mergeInto?: unknown; sortedIds?: unknown };

  if (!Array.isArray(parsed.deleteIds) || !Array.isArray(parsed.sortedIds) || !Array.isArray(parsed.mergeInto)) {
    throw new Error('OpenRouter returned invalid skill organization data.');
  }

  const deleteIds = parsed.deleteIds as unknown[];
  const sortedIds = parsed.sortedIds as unknown[];
  const returnedIds = [...deleteIds, ...sortedIds];
  const mergeInto = parsed.mergeInto as Array<{ deleteId?: unknown; keepId?: unknown }>;

  if (
    returnedIds.some((id) => !Number.isSafeInteger(id)) || new Set(returnedIds).size !== expectedIds.length || expectedIds.some((id) => !returnedIds.includes(id)) || returnedIds.some((id) => !expectedIds.includes(id as number)) ||
    mergeInto.length !== deleteIds.length || mergeInto.some(({ deleteId, keepId }) => !Number.isSafeInteger(deleteId) || !Number.isSafeInteger(keepId) || !deleteIds.includes(deleteId) || !sortedIds.includes(keepId)) ||
    new Set(mergeInto.map(({ deleteId }) => deleteId)).size !== deleteIds.length
  ) {
    throw new Error('OpenRouter did not organize every supplied BookSkill ID exactly once.');
  }

  return { deleteIds: deleteIds as number[], mergeInto: mergeInto as Array<{ deleteId: number; keepId: number }>, sortedIds: sortedIds as number[] };
}

function parseExerciseTemplates (content: string, expectedSkillIds: number[], requireCoverage = true, expectedCount?: number): ExerciseTemplate[] {
  const parsed = parseJson(content);
  const values = Array.isArray(parsed) ? parsed : (parsed as { templates?: unknown })?.templates;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid exercise-template data.');
  }

  const templates = values as Array<Partial<ExerciseTemplate>>;

  if (
    templates.some(({ bookSkillId, solution, text, title }) => !Number.isSafeInteger(bookSkillId) || !expectedSkillIds.includes(bookSkillId as number) || typeof title !== 'string' || !title.trim() || typeof text !== 'string' || !text.trim() || typeof solution !== 'string' || !solution.trim()) ||
    (requireCoverage && expectedSkillIds.some((id) => !templates.some(({ bookSkillId }) => bookSkillId === id))) ||
    (expectedCount !== undefined && templates.length !== expectedCount)
  ) {
    throw new Error('OpenRouter returned an invalid ExerciseTemplate.');
  }

  return templates.map(({ bookSkillId = 0, solution = '', text = '', title = '' }) => ({ bookSkillId, solution: solution.trim(), text: text.trim(), title: title.trim() }));
}

function createSkillBlocks (skills: BookSkill[], concepts: BookConcept[], exercises: BookExercise[]): SkillBlock[] {
  return skills.flatMap((skill) => skill.id === undefined
    ? []
    : [{
      bookConcepts: concepts.filter(({ id }) => id !== undefined && (skill.bookConceptIds ?? []).includes(id)),
      bookExercises: exercises.filter(({ id }) => id !== undefined && (skill.bookExerciseIds ?? []).includes(id)),
      bookSkill: skill as BookSkill & { id: number }
    }]);
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

function BookItem ({ description, id, onDeleted, onError, title, type }: { description: string; id?: number; onDeleted: () => void; onError: (message: string) => void; title: string; type: 'concept' | 'exercise' }): React.ReactElement {
  const remove = useCallback((): void => {
    if (id === undefined) {
      return;
    }

    (type === 'concept' ? deleteBookConcept(id) : deleteBookExercise(id)).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : `Unable to delete the ${type}.`));
  }, [id, onDeleted, onError, type]);

  return <article className='contentCard'>
    <strong><KatexSpan content={title} /></strong>
    {description && <p><KatexSpan content={description} /></p>}
    <Button
      icon='trash'
      onClick={remove}
    />
  </article>;
}

function BookSkillCard ({ bookId, onDeleted, onError, skill }: { bookId: number; onDeleted: () => void; onError: (message: string) => void; skill: BookSkill }): React.ReactElement {
  const remove = useCallback((): void => {
    if (skill.id === undefined) {
      return;
    }

    Promise.all([deleteBookSkill(skill.id), deleteSkillTemplates(skillTemplateModuleId(bookId, skill.id))]).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the BookSkill.'));
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
    <strong><KatexSpan content={template.title} /></strong>
    <p><KatexSpan content={template.text} /></p>
    <div className='solution'><KatexSpan content={template.solution} /></div>
    <Button
      icon='trash'
      onClick={remove}
    />
  </article>;
}

function FinalExerciseCard ({ onDeleted, onError, record }: { onDeleted: () => void; onError: (message: string) => void; record: StoredSkillTemplate }): React.ReactElement {
  const remove = useCallback((): void => {
    deleteSkillTemplate(record.id).then(onDeleted).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the SkillTemplate.'));
  }, [onDeleted, onError, record.id]);

  return <article className='contentCard'>
    <strong><KatexSpan content={record.template.h} /></strong>
    <ExerciseList
      areShownInitially
      exercises={record.template.q}
      location='skill_template_info'
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
      const pageRows = await Promise.all(pages.map(async (page: BookPage) => ({ concepts: await getBookConceptsForBookPage(book.id, page.pageNumber), exercises: await getBookExercisesForBookPage([book.id, page.pageNumber]), page })));
      const result = await Promise.all(chapters.map(async (chapter): Promise<ChapterContent> => {
        const skills = chapter.id === undefined ? [] : await getBookSkillsForChapter(chapter.id);
        const matchingPages = pageRows.filter(({ concepts, page }) => page.chapter === chapter.title || concepts.some(({ chapterId }) => chapterId === chapter.id));
        const exerciseTemplates = (await Promise.all(skills.flatMap(({ id }) => id === undefined ? [] : [getExerciseTemplatesForBookSkill(id)]))).flat();
        const records = (await Promise.all(skills.flatMap(({ id }) => id === undefined ? [] : [getSkillTemplates(skillTemplateModuleId(book.id, id))]))).flat() as Array<{ content: string; id: string; moduleId: string }>;
        const skillTemplates = records.flatMap(({ content, id, moduleId }): StoredSkillTemplate[] => {
          try {
            return [{ content, id, moduleId, template: parseStoredSkillTemplate(content) }];
          } catch {
            return [];
          }
        });

        return { chapter, concepts: matchingPages.flatMap(({ concepts }) => concepts.filter(({ chapterId }) => chapterId === chapter.id)), exerciseTemplates, exercises: matchingPages.flatMap(({ exercises }) => exercises), skillTemplates, skills };
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
  const allExerciseTemplates = useMemo(() => chapterContent.flatMap(({ exerciseTemplates }) => exerciseTemplates), [chapterContent]);
  const allSkillTemplates = useMemo(() => chapterContent.flatMap(({ skillTemplates }) => skillTemplates), [chapterContent]);
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined ? [] : [...concepts.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'concept' as const, title }]), ...exercises.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'exercise' as const, title }])]), [chapterContent]);
  const inferredStage = allSkillTemplates.length ? 8 : allExerciseTemplates.length ? 5 : allSkills.length ? 3 : skillSources.length ? 2 : book.processingStage ?? 0;
  const stage = Math.max(book.processingStage ?? 0, inferredStage);
  const hasCompleteSkillTemplates = allExerciseTemplates.length > 0 && allSkillTemplates.length >= allExerciseTemplates.length;

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

    if (aiAction === 'organize') {
      return chapterContent.filter(({ skills }) => skills.length).map(({ chapter, skills }) => `${deduplicateAndSortSkillsPrompt}\n${chapter.title}\n${JSON.stringify(skills)}`);
    }

    if (aiAction === 'preExercises') {
      return Array.from({ length: Math.ceil(allSkillBlocks.length / BATCH_SIZE) }, (_, index) => `${skillsToExerciseTemplatesPrompt}\n${language}\n${JSON.stringify(allSkillBlocks.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE))}`);
    }

    if (aiAction === 'dividePreExercises') {
      return chapterContent.flatMap(({ chapter, concepts, exerciseTemplates, exercises, skills }) => {
        const blocks = createSkillBlocks(skills, concepts, exercises);

        return Array.from({ length: Math.ceil(blocks.length / BATCH_SIZE) }, (_, index) => {
          const batch = blocks.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE);
          const skillIds = batch.map(({ bookSkill }) => bookSkill.id);

          return `${divideExerciseTemplatesPrompt}\nChapter: ${chapter.title}\n${JSON.stringify({ blocks: batch, templates: exerciseTemplates.filter(({ bookSkillId }) => skillIds.includes(bookSkillId)) })}`;
        });
      });
    }

    if (aiAction === 'exercises') {
      return Array.from({ length: Math.ceil(allExerciseTemplates.length / BATCH_SIZE) }, (_, index) => `${skillsToExercisesPrompt}\n${language}\n${JSON.stringify(allExerciseTemplates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE))}`);
    }

    if (aiAction === 'fix') {
      return chapterContent.flatMap(({ chapter, skillTemplates }) => Array.from({ length: Math.ceil(skillTemplates.length / BATCH_SIZE) }, (_, index) => `${fixSkillTemplatesPrompt}\n${chapter.title}\n${JSON.stringify(skillTemplates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE).map(({ template }) => template))}`));
    }

    if (aiAction === 'fixPreExercises') {
      return chapterContent.flatMap(({ chapter, exerciseTemplates, skills }) => {
        const skillIds = skills.flatMap(({ id }) => id === undefined ? [] : [id]);

        return Array.from({ length: Math.ceil(skillIds.length / BATCH_SIZE) }, (_, index) => {
          const batchIds = skillIds.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE);

          return `${fixExerciseTemplatesPrompt}\n${chapter.title}\n${JSON.stringify({ skills: skills.filter(({ id }) => id !== undefined && batchIds.includes(id)), templates: exerciseTemplates.filter(({ bookSkillId }) => batchIds.includes(bookSkillId)) })}`;
        });
      });
    }

    return [];
  }, [aiAction, allExerciseTemplates, allSkillBlocks, chapterContent, language, skillSources]);
  const generationOutputTokens = aiAction === 'preExercises' || aiAction === 'dividePreExercises' || aiAction === 'fixPreExercises' ? BATCH_SIZE * 1_250 : aiAction === 'exercises' || aiAction === 'fix' ? BATCH_SIZE * 700 : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const validationInputs = useMemo(() => requestInputs.flatMap((input) => [input, `Validate and repair this response against the original request:\n${input}`]), [requestInputs]);
  const outputTokens = generationOutputTokens * 2;
  const estimate = formatAiInputEstimate(estimateAiInput(selectedModel, validationInputs, outputTokens));
  const ensureCredits = useCallback(async (inputs: string[], outputTokenCount: number): Promise<void> => {
    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('No OpenRouter token found. Add it in Settings.');
    }

    await assertOpenRouterCredits(key, estimateAiInput(selectedModel, inputs, outputTokenCount).totalPriceUsd);
  }, [selectedModel]);
  const iconForStage = useCallback((requiredStage: number): 'play' | 'rotate-left' => stage >= requiredStage ? 'rotate-left' : 'play', [stage]);

  const beginProgress = useCallback((label: string, total: number): void => {
    setAiAction(undefined); setError(''); setIsBusy(true); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));
  }, []);

  const generateSkills = useCallback(async (): Promise<void> => {
    beginProgress('Generating BookSkills', skillSources.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);
      const generatedByChapter = new Map<number, Array<Omit<BookSkill, 'chapterId' | 'id'>>>();

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
            bookExerciseIds: source.sourceType === 'exercise' ? [source.sourceId] : [],
            rank: rows.length
          });
          generatedByChapter.set(source.chapterId, rows);
        });
        setProgress(Math.min(skillSources.length, start + batch.length));
      }

      await Promise.all(allSkills.flatMap(({ id }) => id === undefined ? [] : [replaceExerciseTemplatesForBookSkill(id, []), deleteSkillTemplates(skillTemplateModuleId(book.id, id))]));
      await Promise.all(chapters.flatMap(({ id }) => id === undefined ? [] : [replaceBookSkillsForChapter(id, generatedByChapter.get(id) ?? [])]));
      await setStage(3); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate BookSkills.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkills, beginProgress, book.id, chapters, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, setStage, skillSources, validationInputs]);

  const organizeSkills = useCallback(async (): Promise<void> => {
    const groups = chapterContent.filter(({ skills }) => skills.length);

    beginProgress('Deduplicating and sorting BookSkills', groups.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);

      for (const [index, { chapter, skills }] of groups.entries()) {
        if (index) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const rows = skills.filter(({ id }) => id !== undefined).map(({ bookConceptIds, bookExerciseIds, description, id, title }) => ({ bookConceptIds: bookConceptIds ?? [], bookExerciseIds: bookExerciseIds ?? [], description, id, title }));
        const userPrompt = `${deduplicateAndSortSkillsPrompt}\nChapter: ${chapter.title}\n${JSON.stringify(rows)}`;
        const organization = await requestValidatedJson(client, selectedModel, `Keep ISO language ${language}.`, userPrompt, (content) => parseSkillOrganization(content, rows.map(({ id }) => id as number)));

        await deleteAndRankBookSkills(chapter.id as number, organization.deleteIds, organization.sortedIds, organization.mergeInto);
        await Promise.all(organization.deleteIds.map((id) => deleteSkillTemplates(skillTemplateModuleId(book.id, id)))); setProgress(index + 1);
      }

      await setStage(4); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to organize BookSkills.');
    } finally {
      setIsBusy(false);
    }
  }, [beginProgress, book.id, chapterContent, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, setStage, validationInputs]);

  const generatePreExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating ExerciseTemplates', allSkillBlocks.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);
      const generatedBySkill = new Map<number, Array<Omit<ExerciseTemplate, 'bookSkillId' | 'id'>>>();

      for (let start = 0; start < allSkillBlocks.length; start += BATCH_SIZE) {
        const batch = allSkillBlocks.slice(start, start + BATCH_SIZE);
        const expectedSkillIds = batch.map(({ bookSkill }) => bookSkill.id);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const systemPrompt = `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`;
        const userPrompt = `${skillsToExerciseTemplatesPrompt}\n${JSON.stringify(batch)}`;
        const generated = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseExerciseTemplates(content, expectedSkillIds));

        expectedSkillIds.forEach((id) => generatedBySkill.set(id, generated.filter(({ bookSkillId }) => bookSkillId === id).map(({ solution, text, title }) => ({ solution, text, title }))));
        setProgress(Math.min(allSkillBlocks.length, start + batch.length));
      }

      const expectedSkillIds = allSkills.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (expectedSkillIds.some((id) => !generatedBySkill.get(id)?.length)) {
        throw new Error('AI did not generate a validated ExerciseTemplate for every BookSkill. Existing templates were preserved.');
      }

      await Promise.all(expectedSkillIds.map((id) => replaceExerciseTemplatesForBookSkill(id, generatedBySkill.get(id) ?? [])));
      await setStage(5); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate ExerciseTemplates.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkillBlocks, allSkills, beginProgress, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, setStage, validationInputs]);

  const dividePreExercises = useCallback(async (): Promise<void> => {
    beginProgress('Dividing multistep ExerciseTemplates', allSkillBlocks.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);
      let completed = 0;
      let requestIndex = 0;

      for (const { chapter, concepts, exerciseTemplates, exercises, skills } of chapterContent) {
        const blocks = createSkillBlocks(skills, concepts, exercises);

        for (let start = 0; start < blocks.length; start += BATCH_SIZE) {
          const batch = blocks.slice(start, start + BATCH_SIZE);
          const expectedSkillIds = batch.map(({ bookSkill }) => bookSkill.id);
          const parents = exerciseTemplates.filter(({ bookSkillId }) => expectedSkillIds.includes(bookSkillId));

          if (requestIndex++) {
            await delay(REQUEST_INTERVAL_MS);
          }

          const systemPrompt = `Keep ISO language ${language}. Use <kx>...</kx> for every mathematical expression.`;
          const userPrompt = `${divideExerciseTemplatesPrompt}\nChapter: ${chapter.title}\n${JSON.stringify({ blocks: batch, templates: parents })}`;
          const children = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseExerciseTemplates(content, expectedSkillIds, false));

          await Promise.all(expectedSkillIds.map((bookSkillId) => {
            const existing = parents.filter((template) => template.bookSkillId === bookSkillId);
            const signatures = new Set(existing.map(({ solution, text, title }) => JSON.stringify([title.trim(), text.trim(), solution.trim()])));
            const additions = children
              .filter((template) => template.bookSkillId === bookSkillId)
              .filter(({ solution, text, title }) => {
                const signature = JSON.stringify([title, text, solution]);

                if (signatures.has(signature)) {
                  return false;
                }

                signatures.add(signature);

                return true;
              })
              .map(({ solution, text, title }) => ({ solution, text, title }));

            return additions.length ? addExerciseTemplatesForBookSkill(bookSkillId, additions) : Promise.resolve([]);
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
  }, [allSkillBlocks.length, beginProgress, chapterContent, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, setStage, validationInputs]);

  const fixPreExercises = useCallback(async (): Promise<void> => {
    beginProgress('Fixing ExerciseTemplate errors', allSkills.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);
      let completed = 0;
      let requestIndex = 0;

      for (const { chapter, exerciseTemplates, skills } of chapterContent) {
        const skillIds = skills.flatMap(({ id }) => id === undefined ? [] : [id]);

        for (let start = 0; start < skillIds.length; start += BATCH_SIZE) {
          const expectedSkillIds = skillIds.slice(start, start + BATCH_SIZE);
          const selectedSkills = skills.filter(({ id }) => id !== undefined && expectedSkillIds.includes(id));
          const batch = exerciseTemplates.filter(({ bookSkillId }) => expectedSkillIds.includes(bookSkillId));

          if (!selectedSkills.length) {
            continue;
          }

          if (requestIndex++) {
            await delay(REQUEST_INTERVAL_MS);
          }

          const systemPrompt = `Keep ISO language ${language}. Use <kx>...</kx> for every mathematical expression.`;
          const userPrompt = `${fixExerciseTemplatesPrompt}\nChapter: ${chapter.title}\nGenerate missing templates for any supplied skill that has none.\n${JSON.stringify({ skills: selectedSkills, templates: batch })}`;
          const corrected = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseExerciseTemplates(content, expectedSkillIds, true, batch.length));

          await Promise.all(expectedSkillIds.map((bookSkillId) => replaceExerciseTemplatesForBookSkill(
            bookSkillId,
            corrected.filter((template) => template.bookSkillId === bookSkillId).map(({ solution, text, title }) => ({ solution, text, title }))
          )));
          completed += expectedSkillIds.length;
          setProgress(Math.min(allSkills.length, completed));
        }
      }

      await setStage(7); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix ExerciseTemplate errors.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkills.length, beginProgress, chapterContent, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, setStage, validationInputs]);

  const generateExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating SkillTemplates', allExerciseTemplates.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);
      const generatedByModule = new Map<string, string[]>();

      for (let start = 0; start < allExerciseTemplates.length; start += BATCH_SIZE) {
        const batch = allExerciseTemplates.slice(start, start + BATCH_SIZE);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const systemPrompt = `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`;
        const userPrompt = `${skillsToExercisesPrompt}\nReturn exactly ${batch.length} SkillTemplates.\n${JSON.stringify(batch)}`;
        const generated = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseGeneratedSkillTemplates(content, batch.length), false);

        generated.forEach((template, index) => {
          const moduleId = skillTemplateModuleId(book.id, batch[index].bookSkillId);
          const contents = generatedByModule.get(moduleId) ?? [];

          contents.push(JSON.stringify(template));
          generatedByModule.set(moduleId, contents);
        });
        setProgress(Math.min(allExerciseTemplates.length, start + batch.length));
      }

      if (!generatedByModule.size || Array.from(generatedByModule.values()).some(({ length }) => !length)) {
        throw new Error('No validated SkillTemplates were generated. Existing templates were preserved.');
      }

      await Promise.all(Array.from(generatedByModule, ([moduleId, contents]) => replaceSkillTemplates(moduleId, contents)));
      await setStage(8); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate SkillTemplates.');
    } finally {
      setIsBusy(false);
    }
  }, [allExerciseTemplates, beginProgress, book.id, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, setStage, validationInputs]);

  const fixExercises = useCallback(async (): Promise<void> => {
    beginProgress('Fixing SkillTemplate errors', allSkillTemplates.length);

    try {
      const client = await createClient();

      await ensureCredits(validationInputs, outputTokens);
      let completed = 0;
      const correctedByModule = new Map<string, string[]>();

      for (const { skillTemplates } of chapterContent) {
        for (let start = 0; start < skillTemplates.length; start += BATCH_SIZE) {
          const batch = skillTemplates.slice(start, start + BATCH_SIZE);

          if (completed) {
            await delay(REQUEST_INTERVAL_MS);
          }

          const systemPrompt = `Keep ISO language ${language}.`;
          const userPrompt = `${fixSkillTemplatesPrompt}\n${JSON.stringify(batch.map(({ template }) => template))}`;
          const corrected = await requestValidatedJson(client, selectedModel, systemPrompt, userPrompt, (content) => parseGeneratedSkillTemplates(content, batch.length), false);

          batch.forEach(({ moduleId }, index) => {
            const contents = correctedByModule.get(moduleId) ?? [];

            contents.push(JSON.stringify(corrected[index]));
            correctedByModule.set(moduleId, contents);
          });
          completed += batch.length; setProgress(completed);
        }
      }

      await Promise.all(Array.from(correctedByModule, ([moduleId, contents]) => replaceSkillTemplates(moduleId, contents)));
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix SkillTemplate errors.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkillTemplates.length, beginProgress, chapterContent, createClient, ensureCredits, language, outputTokens, refresh, selectedModel, validationInputs]);

  const confirm = useCallback((): void => {
    if (aiAction === 'skills') {
      generateSkills().catch(console.error);
    }

    if (aiAction === 'organize') {
      organizeSkills().catch(console.error);
    }

    if (aiAction === 'preExercises') {
      generatePreExercises().catch(console.error);
    }

    if (aiAction === 'dividePreExercises') {
      dividePreExercises().catch(console.error);
    }

    if (aiAction === 'fixPreExercises') {
      fixPreExercises().catch(console.error);
    }

    if (aiAction === 'exercises') {
      generateExercises().catch(console.error);
    }

    if (aiAction === 'fix') {
      fixExercises().catch(console.error);
    }
  }, [aiAction, dividePreExercises, fixExercises, fixPreExercises, generateExercises, generatePreExercises, generateSkills, organizeSkills]);
  const closeConfirmation = useCallback((): void => setAiAction(undefined), []);
  const openSkillGeneration = useCallback((): void => {
    setAiAction('skills'); onAction?.('conceptsSkills');
  }, [onAction]);
  const openSkillOrganization = useCallback((): void => {
    setAiAction('organize'); onAction?.('conceptsSkills');
  }, [onAction]);
  const openPreExerciseGeneration = useCallback((): void => {
    setAiAction('preExercises'); onAction?.('skillsPreExercises');
  }, [onAction]);
  const openPreExerciseDivision = useCallback((): void => {
    setAiAction('dividePreExercises'); onAction?.('skillsPreExercises');
  }, [onAction]);
  const openPreExerciseFix = useCallback((): void => {
    setAiAction('fixPreExercises'); onAction?.('skillsPreExercises');
  }, [onAction]);
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
            <Button icon='times' label='Cancel' onClick={closeConfirmation} />
            <Button icon='check' label='Continue' onClick={confirm} />
          </Button.Group>
        </Modal.Content>
      </Modal>
    )}
    {isBusy && (
      <div className='processingOverlay'>
        <RoundProgress total={progressTotal} value={progress} />
        <strong>{progressLabel}</strong>
        <span>{progress} / {progressTotal}</span>
      </div>
    )}
    {showPipeline && <div className='pipeline'>
      {pipelinePrefix}
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(3)} isDisabled={isBusy || stage < 2 || !book.language || !skillSources.length} label='Generate Skills' onClick={openSkillGeneration} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(4)} isDisabled={isBusy || stage < 3 || !allSkills.length} label='Deduplicate and sort' onClick={openSkillOrganization} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(5)} isDisabled={isBusy || stage < 4 || !allSkills.length} label='Exercise templates' onClick={openPreExerciseGeneration} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(6)} isDisabled={isBusy || stage < 5 || !allExerciseTemplates.length} label='Divide prexercises' onClick={openPreExerciseDivision} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(7)} isDisabled={isBusy || stage < 6 || !allExerciseTemplates.length} label='Fix PreExercise errors' onClick={openPreExerciseFix} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(8)} isDisabled={isBusy || stage < 7 || !allExerciseTemplates.length} label='Generate Exercises' onClick={openExerciseGeneration} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={stage >= 8 ? 'rotate-left' : 'play'} isDisabled={isBusy || stage < 8 || !hasCompleteSkillTemplates} label='Fix exercise errors' onClick={openExerciseFix} /></span>
    </div>}
    {!pipelineOnly && <>
      <ChapterNavigation chapters={chapters} index={chapterIndex} onChange={changeChapter} />
      {error && <p className='errorMessage' role='alert'>{error}</p>}
      {!current && <p>No chapters have been generated for this book.</p>}
      {current && (
        <>
          <ChapterTitleEditor chapter={current.chapter} onError={setError} onSaved={refresh} />
          {view === 'conceptsSkills' && (
            <div className='columns'>
              <section>
                <h3>Book concepts and exercises</h3>
                {!current.concepts.length && !current.exercises.length && <p>No concepts or exercises in this chapter.</p>}
                {current.concepts.map((concept) => (
                  <BookItem description={concept.description} id={concept.id} key={`concept-${concept.id ?? 'new'}`} onDeleted={refresh} onError={setError} title={concept.title} type='concept' />
                ))}
                {current.exercises.map((exercise) => (
                  <BookItem description={exercise.description} id={exercise.id} key={`exercise-${exercise.id ?? 'new'}`} onDeleted={refresh} onError={setError} title={exercise.title} type='exercise' />
                ))}
              </section>
              <section>
                <h3>BookSkills</h3>
                {!current.skills.length && <p>No BookSkills generated.</p>}
                {current.skills.map((skill) => <BookSkillCard bookId={book.id} key={skill.id} onDeleted={refresh} onError={setError} skill={skill} />)}
              </section>
            </div>
          )}
          {view === 'skillsPreExercises' && (
            <div className='singlePane'>
              {!current.skills.length && <p>No BookSkills generated.</p>}
              {current.skills.map((skill) => <div className='skillWithTemplates' key={skill.id}>
                <BookSkillCard bookId={book.id} onDeleted={refresh} onError={setError} skill={skill} />
                {current.exerciseTemplates.filter(({ bookSkillId }) => bookSkillId === skill.id).map((template) => <PreExerciseCard key={template.id} onDeleted={refresh} onError={setError} template={template} />)}
              </div>)}
            </div>
          )}
          {view === 'preExercisesExercises' && (
            <div className='columns'>
              <section>
                <h3>ExerciseTemplates</h3>
                {current.exerciseTemplates.map((template) => <PreExerciseCard key={template.id} onDeleted={refresh} onError={setError} template={template} />)}
              </section>
              <section>
                <h3>SkillTemplates</h3>
                {!current.skillTemplates.length && <p>No SkillTemplates generated.</p>}
                {current.skillTemplates.map((record) => <FinalExerciseCard key={record.id} onDeleted={refresh} onError={setError} record={record} />)}
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
