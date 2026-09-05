// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookExercise, BookPage, Skill } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { deleteSkillTemplates, getBookChapters, getBookConceptsForBookPage, getBookExercisesForBookPage, getBookPages, getSetting, getSkillsForChapter, getSkillTemplates, replaceSkillsForChapter, SettingKey, storeSkillTemplate } from '@slonigiraf/db';
import { Confirmation, KatexSpan } from '@slonigiraf/slonig-components';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { chapterToSkillsPrompt, OPENAI_MODELS, skillsToExercisesPrompt } from './constants.js';
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

const skillTemplateModuleId = (bookId: number, skillId: number): string => `book-${bookId}-skill-${skillId}`;

function isGeneratedSkill (value: unknown): value is { description: string; title: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const skill = value as Record<string, unknown>;

  return typeof skill.description === 'string' && typeof skill.title === 'string';
}

function parseGeneratedSkills (content: string): Array<Omit<Skill, 'chapterId' | 'id'>> {
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

  const titles = new Set<string>();

  return skills
    .map(({ description, title }) => ({ description: description.trim(), title: title.trim() }))
    .filter(({ title }) => {
      const normalized = title.toLocaleLowerCase().replace(/\s+/g, ' ');

      if (!title || titles.has(normalized)) {
        return false;
      }

      titles.add(normalized);

      return true;
    });
}

function SkillTemplates ({ bookId, skillId }: { bookId: number; skillId?: number }): React.ReactElement | null {
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
      {templates.map(({ id, template }) => (
        <div
          className='skillTemplate'
          key={id}
        >
          <h6><KatexSpan content={template.h} /></h6>
          <ExerciseList
            areShownInitially
            exercises={template.q}
            location='skill_template_info'
          />
        </div>
      ))}
    </div>
    : null;
}

function Skills ({ book }: { book: Book }): React.ReactElement {
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [error, setError] = useState('');
  const [generatedExerciseCount, setGeneratedExerciseCount] = useState(0);
  const [generatedSkillChapterCount, setGeneratedSkillChapterCount] = useState(0);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const [isDeletingTemplates, setIsDeletingTemplates] = useState(false);
  const [isGeneratingExercises, setIsGeneratingExercises] = useState(false);
  const [isGeneratingSkills, setIsGeneratingSkills] = useState(false);
  const [pageContent, setPageContent] = useState<PageContent[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
  const [skills, setSkills] = useState<Skill[]>([]);

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
  const eligibleChapterCount = chapterContent.filter(({ chapter, concepts, exercises }) => chapter.id !== undefined && (concepts.length || exercises.length)).length;
  const skillCount = skills.length;
  const skillModuleIds = useMemo(
    () => skills.filter(({ id }) => id !== undefined).map(({ id }) => skillTemplateModuleId(book.id, id as number)),
    [book.id, skills]
  );
  const templateCount = useLiveQuery(
    async () => (await Promise.all(skillModuleIds.map(getSkillTemplates))).reduce((count, templates) => count + templates.length, 0),
    [skillModuleIds]
  );

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
    if (!eligibleChapterCount || isGeneratingExercises || isGeneratingSkills) {
      return;
    }

    setError('');
    setIsGeneratingSkills(true);
    setGeneratedSkillChapterCount(0);

    try {
      const client = await createClient();
      const eligible = chapterContent.filter(({ chapter, concepts, exercises }) => chapter.id !== undefined && (concepts.length || exercises.length));
      const generatedTitles = new Set<string>();

      for (const [index, { chapter, concepts, exercises }] of eligible.entries()) {
        if (index) {
          await delay(REQUEST_INTERVAL_MS);
        }

        const response = await client.chat.completions.create({
          messages: [
            {
              content: 'Use the natural language of the supplied book chapter for every generated skill title and description. Do not translate the result to English.',
              role: 'system'
            },
            {
              content: `${chapterToSkillsPrompt}\n\nDo not duplicate any of these skills already selected for earlier chapters:\n${JSON.stringify([...generatedTitles])}\n\nChapter content:\n${JSON.stringify({
                chapter: chapter.title,
                concepts: concepts.map(({ description, title }) => ({ description, title })),
                exercises: exercises.map(({ description, title }) => ({ description, title }))
              })}`,
              role: 'user'
            }
          ],
          model: selectedModel,
          response_format: { type: 'json_object' }
        });
        const content = response.choices[0].message?.content?.trim();

        if (!content) {
          throw new Error(`OpenRouter returned no skills for “${chapter.title}”.`);
        }

        const chapterSkills = parseGeneratedSkills(content).filter(({ title }) => !generatedTitles.has(title.toLocaleLowerCase().replace(/\s+/g, ' ')));

        await Promise.all(skills
          .filter(({ chapterId, id }) => chapterId === chapter.id && id !== undefined)
          .map(({ id }) => deleteSkillTemplates(skillTemplateModuleId(book.id, id as number))));
        await replaceSkillsForChapter(chapter.id as number, chapterSkills);
        chapterSkills.forEach(({ title }) => generatedTitles.add(title.toLocaleLowerCase().replace(/\s+/g, ' ')));
        setGeneratedSkillChapterCount((count) => count + 1);
      }

      setRefreshToken((token) => token + 1);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate skills.');
    } finally {
      setIsGeneratingSkills(false);
    }
  }, [book.id, chapterContent, createClient, eligibleChapterCount, isGeneratingExercises, isGeneratingSkills, selectedModel, skills]);

  const generateExercises = useCallback(async (): Promise<void> => {
    if (!skillCount || isGeneratingExercises || isGeneratingSkills) {
      return;
    }

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
                content: 'For each target skill, write the heading, questions, and answers in the natural language used by that skill and its book chapter. Do not default to English.',
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
  }, [book.id, chapterContent, createClient, isGeneratingExercises, isGeneratingSkills, selectedModel, skillCount, skills]);

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

  return <StyledSkills>
    <div className='heading'>
      <h2>Skills</h2>
      <div className='generationControls'>
        <Dropdown
          className='modelSelect'
          isDisabled={!sourceCount || isGeneratingExercises || isGeneratingSkills}
          onChange={setSelectedModel}
          options={OPENAI_MODELS}
          value={selectedModel}
        />
        <Button
          icon='magic'
          isDisabled={!eligibleChapterCount || isGeneratingExercises || isGeneratingSkills || isDeletingTemplates}
          label={isGeneratingSkills ? `Generating skills… ${generatedSkillChapterCount}/${eligibleChapterCount} chapters` : 'Generate skills'}
          onClick={generateSkills}
        />
        <Button
          icon='magic'
          isDisabled={!skillCount || isGeneratingExercises || isGeneratingSkills || isDeletingTemplates}
          label={isGeneratingExercises ? `Generating exercises… ${generatedExerciseCount}/${skillCount}` : 'Generate exercises'}
          onClick={generateExercises}
        />
        {!!templateCount && (
          <Button
            icon='trash-can'
            isDisabled={isGeneratingExercises || isGeneratingSkills || isDeletingTemplates}
            label={isDeletingTemplates ? 'Deleting templates…' : 'Delete all templates'}
            onClick={openClearConfirmation}
          />
        )}
      </div>
    </div>
    {error && (
      <p
        className='errorMessage'
        role='alert'
      >{error}</p>
    )}
    {sourceCount
      ? chapterContent.filter(({ concepts, exercises, skills }) => concepts.length || exercises.length || skills.length).map(({ chapter, concepts, exercises, skills }) => <section key={chapter.id}>
        <h3>{chapter.title}</h3>
        {!!skills.length && <><h4>Generated skills</h4><ul>{skills.map((skill) => <li key={skill.id}>
          <strong>{skill.title}</strong>
          {skill.description && <p>{skill.description}</p>}
          <SkillTemplates
            bookId={book.id}
            skillId={skill.id}
          />
        </li>)}</ul></>}
        {!skills.length && <p className='emptyOutput'>No skills generated for this chapter.</p>}
        {!!concepts.length && <><h4>Book concepts</h4><ul>{concepts.map((concept) => <li key={concept.id}><strong>{concept.title}</strong>{concept.description && <p>{concept.description}</p>}</li>)}</ul></>}
        {!!exercises.length && <><h4>Book exercises</h4><ul>{exercises.map((exercise) => <li key={exercise.id}><strong>{exercise.title}</strong>{exercise.description && <p>{exercise.description}</p>}</li>)}</ul></>}
      </section>)
      : !error && <p className='emptyOutput'>No book concepts or exercises have been generated for this book.</p>}
    {isClearConfirmationOpen && (
      <Confirmation
        onClose={closeClearConfirmation}
        onConfirm={confirmClearSkillTemplates}
        question='Delete all generated exercise templates for this book?'
      />
    )}
  </StyledSkills>;
}

const StyledSkills = styled.div`
  background: var(--bg-page); border-radius: 0.5rem; padding: 1.5rem 2rem;
  .heading { align-items: center; display: flex; gap: 1rem; justify-content: space-between; margin-top: 0; }
  .heading h2 { margin: 0; }
  .generationControls { align-items: center; display: flex; gap: 0.5rem; }
  .modelSelect { min-width: 12rem; }
  section + section { border-top: 1px solid var(--border-table); margin-top: 1.5rem; padding-top: 1rem; }
  h3 { margin-bottom: 0.75rem; }
  li + li { margin-top: 1rem; }
  li p { margin: 0.25rem 0 0; }
  .skillTemplates { border-left: 2px solid var(--border-table); margin-top: 0.75rem; padding-left: 0.75rem; }
  .skillTemplates h5 { margin: 0 0 0.4rem; }
  .skillTemplate + .skillTemplate { border-top: 1px solid var(--border-table); margin-top: 0.75rem; padding-top: 0.75rem; }
  .skillTemplate h6 { margin: 0.5rem 0; }
  @media only screen and (max-width: 900px) { .heading, .generationControls { align-items: stretch; flex-direction: column; } }
`;

export default React.memo(Skills);
