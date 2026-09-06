// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookExercise, BookPage, BookSkill, ExerciseTemplate } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { deleteAndRankBookSkills, deleteBookConcept, deleteBookExercise, deleteBookSkill, deleteExerciseTemplate, deleteSkillTemplate, deleteSkillTemplates, getBookChapters, getBookConceptsForBookPage, getBookExercisesForBookPage, getBookPages, getBookSkillsForChapter, getExerciseTemplatesForBookSkill, getSetting, getSkillTemplates, replaceBookSkillsForChapter, replaceExerciseTemplatesForBookSkill, SettingKey, storeSkillTemplate, updateBookChapterTitle, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { assertOpenRouterCredits, estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { deduplicateAndSortSkillsPrompt, fixSkillTemplatesPrompt, OPENAI_MODELS, skillsToExercisesPrompt, skillsToExerciseTemplatesPrompt, sourcesToSkillsPrompt } from './constants.js';
import { parseGeneratedSkillTemplates, parseStoredSkillTemplate } from './skillTemplates.js';

const REQUEST_INTERVAL_MS = Math.ceil(60_000 / 19);
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
  sourceType: 'concept' | 'exercise';
  title: string;
}

type AiAction = 'exercises' | 'fix' | 'organize' | 'preExercises' | 'skills';

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

function parseSkillOrganization (content: string, expectedIds: number[]): { deleteIds: number[]; sortedIds: number[] } {
  const parsed = parseJson(content) as { deleteIds?: unknown; sortedIds?: unknown };

  if (!Array.isArray(parsed.deleteIds) || !Array.isArray(parsed.sortedIds)) {
    throw new Error('OpenRouter returned invalid skill organization data.');
  }

  const deleteIds = parsed.deleteIds as unknown[];
  const sortedIds = parsed.sortedIds as unknown[];
  const returnedIds = [...deleteIds, ...sortedIds];

  if (returnedIds.some((id) => !Number.isSafeInteger(id)) || new Set(returnedIds).size !== expectedIds.length || expectedIds.some((id) => !returnedIds.includes(id)) || returnedIds.some((id) => !expectedIds.includes(id as number))) {
    throw new Error('OpenRouter did not organize every supplied BookSkill ID exactly once.');
  }

  return { deleteIds: deleteIds as number[], sortedIds: sortedIds as number[] };
}

function parseExerciseTemplates (content: string, expectedSkillIds: number[]): ExerciseTemplate[] {
  const parsed = parseJson(content);
  const values = Array.isArray(parsed) ? parsed : (parsed as { templates?: unknown })?.templates;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid exercise-template data.');
  }

  const templates = values as Array<Partial<ExerciseTemplate>>;

  if (templates.some(({ bookSkillId, solution, text, title }) => !Number.isSafeInteger(bookSkillId) || !expectedSkillIds.includes(bookSkillId as number) || typeof title !== 'string' || typeof text !== 'string' || typeof solution !== 'string')) {
    throw new Error('OpenRouter returned an invalid ExerciseTemplate.');
  }

  return templates.map(({ bookSkillId = 0, solution = '', text = '', title = '' }) => ({ bookSkillId, solution: solution.trim(), text: text.trim(), title: title.trim() }));
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
  const allExerciseTemplates = useMemo(() => chapterContent.flatMap(({ exerciseTemplates }) => exerciseTemplates), [chapterContent]);
  const allSkillTemplates = useMemo(() => chapterContent.flatMap(({ skillTemplates }) => skillTemplates), [chapterContent]);
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined ? [] : [...concepts.map(({ description, title }) => ({ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceType: 'concept' as const, title })), ...exercises.map(({ description, title }) => ({ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceType: 'exercise' as const, title }))]), [chapterContent]);
  const inferredStage = allSkillTemplates.length ? 6 : allExerciseTemplates.length ? 5 : allSkills.length ? 3 : skillSources.length ? 2 : book.processingStage ?? 0;
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
      return Array.from({ length: Math.ceil(allSkills.length / BATCH_SIZE) }, (_, index) => `${skillsToExerciseTemplatesPrompt}\n${language}\n${JSON.stringify(allSkills.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE))}`);
    }

    if (aiAction === 'exercises') {
      return Array.from({ length: Math.ceil(allExerciseTemplates.length / BATCH_SIZE) }, (_, index) => `${skillsToExercisesPrompt}\n${language}\n${JSON.stringify(allExerciseTemplates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE))}`);
    }

    if (aiAction === 'fix') {
      return chapterContent.flatMap(({ chapter, skillTemplates }) => Array.from({ length: Math.ceil(skillTemplates.length / BATCH_SIZE) }, (_, index) => `${fixSkillTemplatesPrompt}\n${chapter.title}\n${JSON.stringify(skillTemplates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE).map(({ template }) => template))}`));
    }

    return [];
  }, [aiAction, allExerciseTemplates, allSkills, chapterContent, language, skillSources]);
  const outputTokens = aiAction === 'preExercises' ? BATCH_SIZE * 1_250 : aiAction === 'exercises' || aiAction === 'fix' ? BATCH_SIZE * 700 : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const estimate = formatAiInputEstimate(estimateAiInput(selectedModel, requestInputs, outputTokens));
  const ensureCredits = useCallback(async (inputs: string[], outputTokenCount: number): Promise<void> => {
    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('No OpenRouter token found. Add it in Settings.');
    }

    await assertOpenRouterCredits(key, estimateAiInput(selectedModel, inputs, outputTokenCount).totalPriceUsd);
  }, [selectedModel]);
  const iconForStage = useCallback((requiredStage: number): 'play' | 'rotate-history' => stage >= requiredStage ? 'rotate-history' : 'play', [stage]);

  const beginProgress = useCallback((label: string, total: number): void => {
    setAiAction(undefined); setError(''); setIsBusy(true); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));
  }, []);

  const generateSkills = useCallback(async (): Promise<void> => {
    beginProgress('Generating BookSkills', skillSources.length);

    try {
      const client = await createClient();
      await ensureCredits(requestInputs, outputTokens);
      const generatedByChapter = new Map<number, Array<Omit<BookSkill, 'chapterId' | 'id'>>>();

      await Promise.all(allSkills.flatMap(({ id }) => id === undefined ? [] : [replaceExerciseTemplatesForBookSkill(id, []), deleteSkillTemplates(skillTemplateModuleId(book.id, id))]));

      for (let start = 0; start < skillSources.length; start += BATCH_SIZE) {
        const batch = skillSources.slice(start, start + BATCH_SIZE);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const response = await client.chat.completions.create({ messages: [{ content: `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`, role: 'system' }, { content: `${sourcesToSkillsPrompt}\nReturn exactly ${batch.length} skills.\n${JSON.stringify(batch)}`, role: 'user' }], model: selectedModel, response_format: { type: 'json_object' } });
        const generated = parseGeneratedSkills(response.choices[0].message?.content ?? '', batch.length);

        generated.forEach((skill, index) => {
          const rows = generatedByChapter.get(batch[index].chapterId) ?? [];

          rows.push({ ...skill, rank: rows.length }); generatedByChapter.set(batch[index].chapterId, rows);
        });
        setProgress(Math.min(skillSources.length, start + batch.length));
      }

      await Promise.all(chapters.flatMap(({ id }) => id === undefined ? [] : [replaceBookSkillsForChapter(id, generatedByChapter.get(id) ?? [])]));
      await setStage(3); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate BookSkills.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkills, beginProgress, book.id, chapters, createClient, ensureCredits, language, outputTokens, refresh, requestInputs, selectedModel, setStage, skillSources]);

  const organizeSkills = useCallback(async (): Promise<void> => {
    const groups = chapterContent.filter(({ skills }) => skills.length);

    beginProgress('Deduplicating and sorting BookSkills', groups.length);

    try {
      const client = await createClient();
      await ensureCredits(requestInputs, outputTokens);

      for (const [index, { chapter, skills }] of groups.entries()) {
        if (index) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const rows = skills.filter(({ id }) => id !== undefined).map(({ description, id, title }) => ({ description, id, title }));
        const response = await client.chat.completions.create({ messages: [{ content: `${deduplicateAndSortSkillsPrompt}\nChapter: ${chapter.title}\n${JSON.stringify(rows)}`, role: 'user' }], model: selectedModel, response_format: { type: 'json_object' } });
        const organization = parseSkillOrganization(response.choices[0].message?.content ?? '', rows.map(({ id }) => id as number));

        await deleteAndRankBookSkills(chapter.id as number, organization.deleteIds, organization.sortedIds);
        await Promise.all(organization.deleteIds.map((id) => deleteSkillTemplates(skillTemplateModuleId(book.id, id)))); setProgress(index + 1);
      }

      await setStage(4); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to organize BookSkills.');
    } finally {
      setIsBusy(false);
    }
  }, [beginProgress, book.id, chapterContent, createClient, ensureCredits, outputTokens, refresh, requestInputs, selectedModel, setStage]);

  const generatePreExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating ExerciseTemplates', allSkills.length);

    try {
      const client = await createClient();
      await ensureCredits(requestInputs, outputTokens);

      for (let start = 0; start < allSkills.length; start += BATCH_SIZE) {
        const batch = allSkills.slice(start, start + BATCH_SIZE).filter(({ id }) => id !== undefined) as Array<BookSkill & { id: number }>;

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const response = await client.chat.completions.create({ messages: [{ content: `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`, role: 'system' }, { content: `${skillsToExerciseTemplatesPrompt}\n${JSON.stringify(batch)}`, role: 'user' }], model: selectedModel, response_format: { type: 'json_object' } });
        const generated = parseExerciseTemplates(response.choices[0].message?.content ?? '', batch.map(({ id }) => id));

        await Promise.all(batch.map(({ id }) => replaceExerciseTemplatesForBookSkill(
          id,
          generated.filter(({ bookSkillId }) => bookSkillId === id).map(({ solution, text, title }) => ({ solution, text, title }))
        )));
        setProgress(Math.min(allSkills.length, start + batch.length));
      }

      await setStage(5); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate ExerciseTemplates.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkills, beginProgress, createClient, ensureCredits, language, outputTokens, refresh, requestInputs, selectedModel, setStage]);

  const generateExercises = useCallback(async (): Promise<void> => {
    beginProgress('Generating SkillTemplates', allExerciseTemplates.length);

    try {
      const client = await createClient();
      await ensureCredits(requestInputs, outputTokens);
      const moduleIds = Array.from(new Set(allExerciseTemplates.map(({ bookSkillId }) => skillTemplateModuleId(book.id, bookSkillId))));

      await Promise.all(moduleIds.map(deleteSkillTemplates));

      for (let start = 0; start < allExerciseTemplates.length; start += BATCH_SIZE) {
        const batch = allExerciseTemplates.slice(start, start + BATCH_SIZE);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const response = await client.chat.completions.create({ messages: [{ content: `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`, role: 'system' }, { content: `${skillsToExercisesPrompt}\nReturn exactly ${batch.length} SkillTemplates.\n${JSON.stringify(batch)}`, role: 'user' }], model: selectedModel });
        const generated = parseGeneratedSkillTemplates(response.choices[0].message?.content ?? '', batch.length);

        await Promise.all(generated.map((template, index) => storeSkillTemplate(skillTemplateModuleId(book.id, batch[index].bookSkillId), JSON.stringify(template))));
        setProgress(Math.min(allExerciseTemplates.length, start + batch.length));
      }

      await setStage(6); refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate SkillTemplates.');
    } finally {
      setIsBusy(false);
    }
  }, [allExerciseTemplates, beginProgress, book.id, createClient, ensureCredits, language, outputTokens, refresh, requestInputs, selectedModel, setStage]);

  const fixExercises = useCallback(async (): Promise<void> => {
    beginProgress('Fixing SkillTemplate errors', allSkillTemplates.length);

    try {
      const client = await createClient(); await ensureCredits(requestInputs, outputTokens); let completed = 0;

      for (const { skillTemplates } of chapterContent) {
        for (let start = 0; start < skillTemplates.length; start += BATCH_SIZE) {
          const batch = skillTemplates.slice(start, start + BATCH_SIZE);

          if (completed) {
            await delay(REQUEST_INTERVAL_MS);
          }

          const response = await client.chat.completions.create({ messages: [{ content: `Keep ISO language ${language}.`, role: 'system' }, { content: `${fixSkillTemplatesPrompt}\n${JSON.stringify(batch.map(({ template }) => template))}`, role: 'user' }], model: selectedModel });
          const corrected = parseGeneratedSkillTemplates(response.choices[0].message?.content ?? '', batch.length);

          await Promise.all(batch.map(async ({ id, moduleId }, index) => {
            await deleteSkillTemplate(id); await storeSkillTemplate(moduleId, JSON.stringify(corrected[index]));
          })); completed += batch.length; setProgress(completed);
        }
      }

      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix SkillTemplate errors.');
    } finally {
      setIsBusy(false);
    }
  }, [allSkillTemplates.length, beginProgress, chapterContent, createClient, ensureCredits, language, outputTokens, refresh, requestInputs, selectedModel]);

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

    if (aiAction === 'exercises') {
      generateExercises().catch(console.error);
    }

    if (aiAction === 'fix') {
      fixExercises().catch(console.error);
    }
  }, [aiAction, fixExercises, generateExercises, generatePreExercises, generateSkills, organizeSkills]);
  const closeConfirmation = useCallback((): void => setAiAction(undefined), []);
  const openSkillGeneration = useCallback((): void => { setAiAction('skills'); onAction?.('conceptsSkills'); }, [onAction]);
  const openSkillOrganization = useCallback((): void => { setAiAction('organize'); onAction?.('conceptsSkills'); }, [onAction]);
  const openPreExerciseGeneration = useCallback((): void => { setAiAction('preExercises'); onAction?.('skillsPreExercises'); }, [onAction]);
  const openExerciseGeneration = useCallback((): void => { setAiAction('exercises'); onAction?.('preExercisesExercises'); }, [onAction]);
  const openExerciseFix = useCallback((): void => { setAiAction('fix'); onAction?.('preExercisesExercises'); }, [onAction]);

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
      <span className='pipelineStep'><span>›</span><Button icon={iconForStage(6)} isDisabled={isBusy || stage < 5 || !allExerciseTemplates.length} label='Generate Exercises' onClick={openExerciseGeneration} /></span>
      <span className='pipelineStep'><span>›</span><Button icon={stage >= 6 ? 'rotate-history' : 'play'} isDisabled={isBusy || stage < 6 || !hasCompleteSkillTemplates} label='Fix exercise errors' onClick={openExerciseFix} /></span>
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
  .contentCard { border-bottom: 1px solid var(--border-table); min-width: 0; padding: 0.75rem 10px; position: relative; }
  .contentCard > .ui--Button { position: absolute; right: 10px; top: 10px; }
  .contentCard > strong { display: block; max-width: calc(100% - 3rem); overflow-wrap: anywhere; }
  .skillWithTemplates + .skillWithTemplates { border-top: 1px solid var(--border-table); margin-top: 0.75rem; padding-top: 0.5rem; }
  .skillWithTemplates .contentCard + .contentCard { border-left: 3px solid var(--border-table); margin-left: 1.5rem; }
  .contentCard p { margin: 0.35rem 0; }
  .contentCard .solution { border-left: 0.2rem solid var(--border-table); margin: 0.5rem 0; padding-left: 0.75rem; }
  .processingOverlay { align-items: center; background: color-mix(in srgb, var(--bg-page) 92%, transparent); display: flex; flex-direction: column; gap: 0.75rem; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
  .errorMessage { color: #9f3a38; }
  @media only screen and (max-width: 900px) { .columns { grid-template-columns: 1fr; } .chapterEditor { align-items: stretch; flex-direction: column; } }
`;

export default React.memo(Skills);
