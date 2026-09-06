// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookExercise, BookPage, Skill } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { deleteAndRankSkills, deleteBookConcept, deleteBookExercise, deleteSkillTemplate, deleteSkillTemplates, getBookChapters, getBookConceptsForBookPage, getBookExercisesForBookPage, getBookPages, getSetting, getSkillsForChapter, getSkillTemplates, replaceSkillsForChapter, SettingKey, storeSkillTemplate, updateBookChapterTitle } from '@slonigiraf/db';
import { Confirmation, KatexSpan } from '@slonigiraf/slonig-components';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { deduplicateAndSortSkillsPrompt, OPENAI_MODELS, skillsToExercisesPrompt, sourcesToSkillsPrompt } from './constants.js';
import { parseGeneratedSkillTemplates, parseStoredSkillTemplate } from './skillTemplates.js';

const REQUEST_INTERVAL_MS = Math.ceil(60_000 / 19);
const SKILL_BATCH_SIZE = 10;
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface PageContent {
  concepts: BookConcept[];
  exercises: BookExercise[];
  page: BookPage;
}

interface ChapterContent {
  chapter: BookChapter;
  concepts: BookConcept[];
  exercises: BookExercise[];
  skills: Skill[];
}

interface SkillSource {
  chapterId: number;
  chapterTitle: string;
  description: string;
  sourceType: 'concept' | 'exercise';
  title: string;
}

type AiAction = 'exercises' | 'organize' | 'skills';

const skillTemplateModuleId = (bookId: number, skillId: number): string => `book-${bookId}-skill-${skillId}`;

function ChapterTitleEditor ({ chapter, onError, onSaved }: { chapter: BookChapter; onError: (error: string) => void; onSaved: () => void }): React.ReactElement {
  const [title, setTitle] = useState(chapter.title);
  const save = useCallback((): void => {
    if (chapter.id === undefined || !title.trim()) {
      return;
    }

    updateBookChapterTitle(chapter.id, title.trim())
      .then(onSaved)
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to rename the chapter.'));
  }, [chapter.id, onError, onSaved, title]);

  return <div className='chapterEditor'>
    <Input label='Chapter name' onChange={setTitle} onEnter={save} value={title} />
    <Button icon='save' isDisabled={!title.trim() || title.trim() === chapter.title} label='Save chapter name' onClick={save} />
  </div>;
}

function BookItemRow ({ description, id, onDeleted, onError, title, type }: { description: string; id?: number; onDeleted: () => void; onError: (error: string) => void; title: string; type: 'concept' | 'exercise' }): React.ReactElement {
  const deleteItem = useCallback((): void => {
    if (id === undefined) {
      return;
    }

    (type === 'concept' ? deleteBookConcept(id) : deleteBookExercise(id))
      .then(onDeleted)
      .catch((error) => onError(error instanceof Error ? error.message : `Unable to delete the ${type}.`));
  }, [id, onDeleted, onError, type]);

  return <li>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
    <Button icon='trash' label={`Delete ${type}`} onClick={deleteItem} />
  </li>;
}

function SkillTemplateCard ({ id, onError, template }: { id: string; onError: (error: string) => void; template: GeneratedSkillTemplate }): React.ReactElement {
  const deleteTemplate = useCallback((): void => {
    deleteSkillTemplate(id).catch((error) => onError(error instanceof Error ? error.message : 'Unable to delete the exercise template.'));
  }, [id, onError]);

  return <div className='skillTemplate'>
    <h6><KatexSpan content={template.h} /></h6>
    <Button icon='trash' label='Delete template' onClick={deleteTemplate} />
    <ExerciseList areShownInitially exercises={template.q} location='skill_template_info' />
  </div>;
}

function isGeneratedSkill (value: unknown): value is { description: string; title: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const skill = value as Record<string, unknown>;

  return typeof skill.description === 'string' && typeof skill.title === 'string';
}

function parseGeneratedSkills (content: string, expectedCount: number): Array<{ description: string; title: string }> {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\'));
  }

  const skills = Array.isArray(parsed) ? parsed : (parsed as { skills?: unknown })?.skills;

  if (!Array.isArray(skills) || !skills.every(isGeneratedSkill)) {
    throw new Error('OpenRouter returned invalid skill data.');
  }

  const result = (skills as Array<{ description: string; title: string }>).map(({ description, title }) => ({ description: description.trim(), title: title.trim() }));

  if (result.length !== expectedCount || result.some(({ title }) => !title)) {
    throw new Error(`OpenRouter returned ${result.length} skills for ${expectedCount} source items.`);
  }

  return result;
}

function parseSkillOrganization (content: string, expectedIds: number[]): { deleteIds: number[]; sortedIds: number[] } {
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, '').trim()) as { deleteIds?: unknown; sortedIds?: unknown };

  if (!Array.isArray(parsed.deleteIds) || !Array.isArray(parsed.sortedIds)) {
    throw new Error('OpenRouter returned invalid skill organization data.');
  }

  const deleteIds = parsed.deleteIds as unknown[];
  const sortedIds = parsed.sortedIds as unknown[];

  if ([...deleteIds, ...sortedIds].some((id) => !Number.isSafeInteger(id))) {
    throw new Error('OpenRouter returned invalid skill IDs.');
  }

  const returnedIds = [...deleteIds, ...sortedIds] as number[];

  if (new Set(returnedIds).size !== expectedIds.length || expectedIds.some((id) => !returnedIds.includes(id)) || returnedIds.some((id) => !expectedIds.includes(id))) {
    throw new Error('OpenRouter did not organize every supplied skill ID exactly once.');
  }

  return { deleteIds: deleteIds as number[], sortedIds: sortedIds as number[] };
}

function SkillTemplates ({ bookId, onError, skillId }: { bookId: number; onError: (error: string) => void; skillId?: number }): React.ReactElement | null {
  const records = useLiveQuery(
    () => skillId === undefined ? [] : getSkillTemplates(skillTemplateModuleId(bookId, skillId)),
    [bookId, skillId]
  );
  const templates: Array<{ id: string; template: GeneratedSkillTemplate }> = [];

  records?.forEach(({ content, id }) => {
    try {
      templates.push({ id, template: parseStoredSkillTemplate(content) });
    } catch {
      // A corrupt template should not prevent the remaining exercises rendering.
    }
  });

  return templates.length
    ? <div className='skillTemplates'>
      <h5>Generated exercises</h5>
      {templates.map(({ id, template }) => <SkillTemplateCard id={id} key={id} onError={onError} template={template} />)}
    </div>
    : null;
}

function Skills ({ book }: { book: Book }): React.ReactElement {
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [aiAction, setAiAction] = useState<AiAction>();
  const [error, setError] = useState('');
  const [generatedExerciseCount, setGeneratedExerciseCount] = useState(0);
  const [generatedSkillCount, setGeneratedSkillCount] = useState(0);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const [isDeletingTemplates, setIsDeletingTemplates] = useState(false);
  const [isGeneratingExercises, setIsGeneratingExercises] = useState(false);
  const [isGeneratingSkills, setIsGeneratingSkills] = useState(false);
  const [isOrganizingSkills, setIsOrganizingSkills] = useState(false);
  const [pageContent, setPageContent] = useState<PageContent[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
  const [skills, setSkills] = useState<Skill[]>([]);
  const refresh = useCallback((): void => setRefreshToken((token) => token + 1), []);

  useEffect(() => {
    let active = true;

    setError('');
    Promise.all([getBookPages(book.id), getBookChapters(book.id)])
      .then(async ([pages, storedChapters]) => {
        const [storedPages, storedSkills] = await Promise.all([
          Promise.all(pages.sort((a, b) => a.pageNumber - b.pageNumber).map(async (page) => {
            const [concepts, exercises] = await Promise.all([
              getBookConceptsForBookPage(book.id, page.pageNumber),
              getBookExercisesForBookPage([book.id, page.pageNumber])
            ]);

            return { concepts, exercises, page };
          })),
          Promise.all(storedChapters.filter(({ id }) => id !== undefined).map(({ id }) => getSkillsForChapter(id as number)))
        ]);

        if (active) {
          setChapters(storedChapters);
          setPageContent(storedPages);
          setSkills(storedSkills.flat());
        }
      })
      .catch(() => active && setError('Unable to load this book’s learning content.'));

    return () => {
      active = false;
    };
  }, [book.id, refreshToken]);

  const chapterContent = useMemo<ChapterContent[]>(() => chapters.map((chapter) => {
    const matchingPages = pageContent.filter(({ concepts, page }) =>
      concepts.some(({ chapterId }) => chapterId === chapter.id) || page.chapter === chapter.title
    );

    return {
      chapter,
      concepts: matchingPages.flatMap(({ concepts }) => concepts.filter(({ chapterId }) => chapterId === chapter.id)),
      exercises: matchingPages.flatMap(({ exercises }) => exercises),
      skills: skills.filter(({ chapterId }) => chapterId === chapter.id)
    };
  }), [chapters, pageContent, skills]);
  const sourceCount = pageContent.reduce((count, { concepts, exercises }) => count + concepts.length + exercises.length, 0);
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined
    ? []
    : [
      ...concepts.map(({ description, title }) => ({ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceType: 'concept' as const, title })),
      ...exercises.map(({ description, title }) => ({ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceType: 'exercise' as const, title }))
    ]), [chapterContent]);
  const skillCount = skills.length;
  const skillModuleIds = useMemo(
    () => skills.filter(({ id }) => id !== undefined).map(({ id }) => skillTemplateModuleId(book.id, id as number)),
    [book.id, skills]
  );
  const templateCount = useLiveQuery(
    async () => (await Promise.all(skillModuleIds.map(getSkillTemplates))).reduce((count, templates) => count + templates.length, 0),
    [skillModuleIds]
  );
  const aiEstimate = useMemo(() => {
    let requestInputs: string[] = [];

    if (aiAction === 'skills') {
      requestInputs = Array.from({ length: Math.ceil(skillSources.length / SKILL_BATCH_SIZE) }, (_, index) => {
        const batch = skillSources.slice(index * SKILL_BATCH_SIZE, (index + 1) * SKILL_BATCH_SIZE);

        return `Write every generated skill strictly in language ${book.language ?? 'unknown'}.\n${sourcesToSkillsPrompt}\nReturn exactly ${batch.length} skills.\n${JSON.stringify(batch)}`;
      });
    } else if (aiAction === 'exercises') {
      requestInputs = Array.from({ length: Math.ceil(skills.length / SKILL_BATCH_SIZE) }, (_, index) => {
        const batch = skills.slice(index * SKILL_BATCH_SIZE, (index + 1) * SKILL_BATCH_SIZE);
        const contexts = batch.map((skill) => {
          const source = chapterContent.find(({ chapter }) => chapter.id === skill.chapterId);

          return {
            bookExercises: source?.exercises.map(({ description, title }) => ({ description, title })) ?? [],
            chapter: source?.chapter.title ?? '',
            concepts: source?.concepts.map(({ description, title }) => ({ description, title })) ?? [],
            targetSkill: { description: skill.description, title: skill.title }
          };
        });

        return `Write every exercise strictly in language ${book.language ?? 'unknown'}.\n${skillsToExercisesPrompt}\nReturn exactly ${batch.length} templates.\n${JSON.stringify(contexts)}`;
      });
    } else if (aiAction === 'organize') {
      requestInputs = chapterContent.filter(({ skills }) => skills.length).map(({ chapter, skills }) => `${deduplicateAndSortSkillsPrompt}\n${chapter.title}\n${JSON.stringify(skills)}`);
    }

    return formatAiInputEstimate(estimateAiInput(selectedModel, requestInputs));
  }, [aiAction, book.language, chapterContent, selectedModel, skillSources, skills]);

  const createClient = useCallback(async (): Promise<OpenAI> => {
    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('No OpenRouter token found. Add it in Settings.');
    }

    return new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      dangerouslyAllowBrowser: true,
      defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }
    });
  }, []);

  const generateSkills = useCallback(async (): Promise<void> => {
    if (!skillSources.length || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills) {
      return;
    }

    setAiAction(undefined);
    setError('');
    setIsGeneratingSkills(true);
    setGeneratedSkillCount(0);

    try {
      const client = await createClient();
      const generatedByChapter = new Map<number, Array<Omit<Skill, 'chapterId' | 'id'>>>();

      for (let start = 0; start < skillSources.length; start += SKILL_BATCH_SIZE) {
        const batch = skillSources.slice(start, start + SKILL_BATCH_SIZE);

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const response = await client.chat.completions.create({
          messages: [
            {
              content: `Write every generated skill strictly in the language identified by this ISO 639-1 code: ${book.language || 'en'}.`,
              role: 'system'
            },
            {
              content: `${sourcesToSkillsPrompt}\n\nBook language: ${book.language || 'en'}\nReturn exactly ${batch.length} skills.\n\nSource items:\n${JSON.stringify(batch)}`,
              role: 'user'
            }
          ],
          model: selectedModel,
          response_format: { type: 'json_object' }
        });
        const content = response.choices[0].message?.content?.trim();

        if (!content) {
          throw new Error('OpenRouter returned no skills.');
        }

        const generated = parseGeneratedSkills(content, batch.length);

        generated.forEach((skill, index) => {
          const chapterSkills = generatedByChapter.get(batch[index].chapterId) ?? [];

          chapterSkills.push({ ...skill, rank: chapterSkills.length });
          generatedByChapter.set(batch[index].chapterId, chapterSkills);
        });
        setGeneratedSkillCount((count) => count + batch.length);
      }

      await Promise.all(chapters.filter(({ id }) => id !== undefined).map(({ id }) => replaceSkillsForChapter(id as number, generatedByChapter.get(id as number) ?? [])));
      setRefreshToken((token) => token + 1);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate skills.');
    } finally {
      setIsGeneratingSkills(false);
    }
  }, [book.language, chapters, createClient, isGeneratingExercises, isGeneratingSkills, isOrganizingSkills, selectedModel, skillSources]);

  const generateExercises = useCallback(async (): Promise<void> => {
    if (!skillCount || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills) {
      return;
    }

    setAiAction(undefined);
    setError('');
    setIsGeneratingExercises(true);
    setGeneratedExerciseCount(0);

    try {
      const client = await createClient();
      const allSkills = skills.filter(({ id }) => id !== undefined) as Array<Skill & { id: number }>;
      const existing = await Promise.all(allSkills.map(({ id }) => getSkillTemplates(skillTemplateModuleId(book.id, id))));
      const pending = allSkills.filter((_, index) => !existing[index].length);
      let failures = 0;
      let lastFailure = '';

      setGeneratedExerciseCount(allSkills.length - pending.length);

      for (let start = 0; start < pending.length; start += SKILL_BATCH_SIZE) {
        const batch = pending.slice(start, start + SKILL_BATCH_SIZE);
        const contexts = batch.map((skill) => {
          const source = chapterContent.find(({ chapter }) => chapter.id === skill.chapterId);

          return {
            bookExercises: source?.exercises.map(({ description, title }) => ({ description, title })) ?? [],
            chapter: source?.chapter.title ?? '',
            concepts: source?.concepts.map(({ description, title }) => ({ description, title })) ?? [],
            targetSkill: { description: skill.description, title: skill.title }
          };
        });

        if (start) {
          await delay(REQUEST_INTERVAL_MS);
        }

        try {
          const response = await client.chat.completions.create({
            messages: [
              {
                content: `Write every exercise heading, question, and answer strictly in the language identified by this ISO 639-1 code: ${book.language || 'en'}.`,
                role: 'system'
              },
              {
                content: `${skillsToExercisesPrompt}\n\nReturn exactly ${batch.length} skill templates in the JSON array, in the same order as these target skill contexts:\n${JSON.stringify(contexts)}`,
                role: 'user'
              }
            ],
            model: selectedModel
          });
          const content = response.choices[0].message?.content?.trim();

          if (!content) {
            throw new Error('OpenRouter returned no exercise templates.');
          }

          const templates = parseGeneratedSkillTemplates(content, batch.length);

          await Promise.all(templates.map((template, index) => storeSkillTemplate(skillTemplateModuleId(book.id, batch[index].id), JSON.stringify(template))));
          setGeneratedExerciseCount((count) => count + batch.length);
        } catch (batchError) {
          failures += batch.length;
          lastFailure = batchError instanceof Error ? batchError.message : 'Unable to generate exercises.';
        }
      }

      if (failures) {
        setError(`${failures} of ${allSkills.length} skills could not have exercises generated. ${lastFailure}`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingExercises(false);
    }
  }, [book.id, book.language, chapterContent, createClient, isGeneratingExercises, isGeneratingSkills, isOrganizingSkills, selectedModel, skillCount, skills]);

  const organizeSkills = useCallback(async (): Promise<void> => {
    if (!skillCount || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills) {
      return;
    }

    setAiAction(undefined);
    setError('');
    setIsOrganizingSkills(true);

    try {
      const client = await createClient();

      for (const [index, { chapter, skills: chapterSkills }] of chapterContent.filter(({ skills }) => skills.length).entries()) {
        if (index) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const skillRows = chapterSkills.filter(({ id }) => id !== undefined).map(({ description, id, title }) => ({ description, id, title }));
        const response = await client.chat.completions.create({
          messages: [{
            content: `${deduplicateAndSortSkillsPrompt}\n\nChapter: ${chapter.title}\nSkills:\n${JSON.stringify(skillRows)}`,
            role: 'user'
          }],
          model: selectedModel,
          response_format: { type: 'json_object' }
        });
        const content = response.choices[0].message?.content?.trim();

        if (!content) {
          throw new Error('OpenRouter returned no skill ordering.');
        }

        const ids = skillRows.map(({ id }) => id as number);
        const organization = parseSkillOrganization(content, ids);

        await deleteAndRankSkills(chapter.id as number, organization.deleteIds, organization.sortedIds);
        await Promise.all(organization.deleteIds.map((id) => deleteSkillTemplates(skillTemplateModuleId(book.id, id))));
      }

      setRefreshToken((token) => token + 1);
    } catch (organizationError) {
      setError(organizationError instanceof Error ? organizationError.message : 'Unable to deduplicate and sort skills.');
    } finally {
      setIsOrganizingSkills(false);
    }
  }, [book.id, chapterContent, createClient, isGeneratingExercises, isGeneratingSkills, isOrganizingSkills, selectedModel, skillCount]);

  const clearSkillTemplates = useCallback(async (): Promise<void> => {
    setIsDeletingTemplates(true);

    try {
      await Promise.all(skillModuleIds.map(deleteSkillTemplates));
      setIsClearConfirmationOpen(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete exercise templates.');
    } finally {
      setIsDeletingTemplates(false);
    }
  }, [skillModuleIds]);
  const closeClearConfirmation = useCallback((): void => setIsClearConfirmationOpen(false), []);
  const confirmClearSkillTemplates = useCallback((): void => {
    clearSkillTemplates().catch(console.error);
  }, [clearSkillTemplates]);
  const openClearConfirmation = useCallback((): void => setIsClearConfirmationOpen(true), []);
  const closeAiConfirmation = useCallback((): void => setAiAction(undefined), []);
  const confirmAiAction = useCallback((): void => {
    if (aiAction === 'skills') {
      generateSkills().catch(console.error);
    } else if (aiAction === 'exercises') {
      generateExercises().catch(console.error);
    } else if (aiAction === 'organize') {
      organizeSkills().catch(console.error);
    }
  }, [aiAction, generateExercises, generateSkills, organizeSkills]);
  const openExerciseGeneration = useCallback((): void => setAiAction('exercises'), []);
  const openSkillGeneration = useCallback((): void => setAiAction('skills'), []);
  const openSkillOrganization = useCallback((): void => setAiAction('organize'), []);

  return <StyledSkills>
    <div className='heading'>
      <div>
        <h2>Skills</h2>
        <small>Book language: {book.language?.toUpperCase() ?? 'not detected'}</small>
      </div>
      <div className='generationControls'>
        <Dropdown
          className='modelSelect'
          isDisabled={!sourceCount || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills}
          onChange={setSelectedModel}
          options={OPENAI_MODELS}
          value={selectedModel}
        />
        <Button
          icon='magic'
          isDisabled={!book.language || !skillSources.length || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills || isDeletingTemplates}
          label={isGeneratingSkills ? `Generating skills… ${generatedSkillCount}/${skillSources.length}` : 'Generate skills'}
          onClick={openSkillGeneration}
        />
        <Button
          icon='magic'
          isDisabled={!skillCount || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills || isDeletingTemplates}
          label={isGeneratingExercises ? `Generating exercises… ${generatedExerciseCount}/${skillCount}` : 'Generate exercises'}
          onClick={openExerciseGeneration}
        />
        <Button
          icon='sort-amount-down'
          isDisabled={!skillCount || isGeneratingExercises || isGeneratingSkills || isOrganizingSkills || isDeletingTemplates}
          label={isOrganizingSkills ? 'Deduplicating and sorting…' : 'Deduplicate and sort skills'}
          onClick={openSkillOrganization}
        />
        {!!templateCount && (
          <Button
            icon='trash-can'
            isDisabled={isGeneratingExercises || isGeneratingSkills || isOrganizingSkills || isDeletingTemplates}
            label={isDeletingTemplates ? 'Deleting templates…' : 'Delete all templates'}
            onClick={openClearConfirmation}
          />
        )}
      </div>
    </div>
    {!book.language && sourceCount > 0 && <p className='recognitionHint'>Recognize the first two pages to determine the book language before generating skills.</p>}
    {error && (
      <p
        className='errorMessage'
        role='alert'
      >{error}</p>
    )}
    {sourceCount
      ? chapterContent.filter(({ concepts, exercises, skills }) => concepts.length || exercises.length || skills.length).map(({ chapter, concepts, exercises, skills }) => <section key={chapter.id}>
        <ChapterTitleEditor chapter={chapter} onError={setError} onSaved={refresh} />
        {!!skills.length && <><h4>Generated skills</h4><ol>{skills.map((skill) => <li key={skill.id}>
          <strong>{skill.title}</strong>
          {skill.description && <p>{skill.description}</p>}
          <SkillTemplates
            bookId={book.id}
            onError={setError}
            skillId={skill.id}
          />
        </li>)}</ol></>}
        {!skills.length && <p className='emptyOutput'>No skills generated for this chapter.</p>}
        {!!concepts.length && <><h4>Book concepts</h4><ul>{concepts.map((concept) => <BookItemRow description={concept.description} id={concept.id} key={concept.id} onDeleted={refresh} onError={setError} title={concept.title} type='concept' />)}</ul></>}
        {!!exercises.length && <><h4>Book exercises</h4><ul>{exercises.map((exercise) => <BookItemRow description={exercise.description} id={exercise.id} key={exercise.id} onDeleted={refresh} onError={setError} title={exercise.title} type='exercise' />)}</ul></>}
      </section>)
      : !error && <p className='emptyOutput'>No book concepts or exercises have been generated for this book.</p>}
    {isClearConfirmationOpen && (
      <Confirmation
        onClose={closeClearConfirmation}
        onConfirm={confirmClearSkillTemplates}
        question='Delete all generated exercise templates for this book?'
      />
    )}
    {aiAction && (
      <Modal
        header={aiAction === 'skills' ? 'Generate skills' : aiAction === 'exercises' ? 'Generate exercises' : 'Deduplicate and sort skills'}
        onClose={closeAiConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{aiEstimate}</p>
          <Button.Group>
            <Button icon='times' label='Cancel' onClick={closeAiConfirmation} />
            <Button icon='check' label='Continue' onClick={confirmAiAction} />
          </Button.Group>
        </Modal.Content>
      </Modal>
    )}
  </StyledSkills>;
}

const StyledSkills = styled.div`
  background: var(--bg-page); border-radius: 0.5rem; padding: 1.5rem 2rem;
  .heading { align-items: center; display: flex; gap: 1rem; justify-content: space-between; margin-top: 0; }
  .heading h2 { margin: 0; }
  .generationControls { align-items: center; display: flex; gap: 0.5rem; }
  .modelSelect { min-width: 12rem; }
  .chapterEditor { align-items: flex-end; display: flex; gap: 0.5rem; }
  .chapterEditor > :first-child { flex: 1; }
  section + section { border-top: 1px solid var(--border-table); margin-top: 1.5rem; padding-top: 1rem; }
  h3 { margin-bottom: 0.75rem; }
  li + li { margin-top: 1rem; }
  li p { margin: 0.25rem 0 0; }
  .skillTemplates { border-left: 2px solid var(--border-table); margin-top: 0.75rem; padding-left: 0.75rem; }
  .skillTemplates h5 { margin: 0 0 0.4rem; }
  .skillTemplate + .skillTemplate { border-top: 1px solid var(--border-table); margin-top: 0.75rem; padding-top: 0.75rem; }
  .skillTemplate h6 { margin: 0.5rem 0; }
  @media only screen and (max-width: 900px) { .chapterEditor, .heading, .generationControls { align-items: stretch; flex-direction: column; } }
`;

export default React.memo(Skills);
