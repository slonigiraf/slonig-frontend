// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookExercise, BookPage, Concept } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { deleteSkillTemplates, getBookExercisesForBookPage, getBookPages, getConceptsForBookPage, getSetting, getSkillTemplates, SettingKey, storeSkillTemplate } from '@slonigiraf/db';
import { Confirmation, KatexSpan } from '@slonigiraf/slonig-components';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Dropdown, styled } from '@polkadot/react-components';

import ExerciseList from './Edit/ExerciseList.js';
import { OPENAI_MODELS, conceptsToSkillsPrompt } from './constants.js';
import { parseGeneratedSkillTemplates, parseStoredSkillTemplate } from './skillTemplates.js';

// Keep one request of headroom below the provider's 20 requests/minute limit.
const MAX_BATCH_REQUESTS_PER_MIN = 19;
const CONCEPT_BATCH_SIZE = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const BATCH_REQUEST_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / MAX_BATCH_REQUESTS_PER_MIN);

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface PageSkills {
  concepts: Concept[];
  exercises: BookExercise[];
  page: BookPage;
}

interface ChapterSkills {
  chapter?: string;
  concepts: Concept[];
  exercises: BookExercise[];
}

function conceptTemplateModuleId (bookId: number, conceptId: number): string {
  return `book-${bookId}-concept-${conceptId}`;
}

function ConceptSkillTemplates ({ bookId, conceptId }: { bookId: number; conceptId?: number }): React.ReactElement | null {
  const skillTemplates = useLiveQuery(
    () => conceptId === undefined ? [] : getSkillTemplates(conceptTemplateModuleId(bookId, conceptId)),
    [bookId, conceptId]
  );

  if (!skillTemplates?.length) {
    return null;
  }

  const templates: Array<{ id: string; template: GeneratedSkillTemplate }> = [];

  skillTemplates.forEach(({ content, id }) => {
    try {
      templates.push({ id, template: parseStoredSkillTemplate(content) });
    } catch {
      // Ignore corrupt templates rather than preventing the remaining exercises from rendering.
    }
  });

  if (!templates.length) {
    return null;
  }

  return <div className='conceptTemplates'>
    <h4>Generated exercises</h4>
    {templates.map(({ id, template }) => <div className='skillTemplate' key={id}>
      <h5><KatexSpan content={template.h} /></h5>
      <ExerciseList
        areShownInitially
        exercises={template.q}
        location='skill_template_info'
      />
    </div>)}
  </div>;
}

function Skills ({ book }: { book: Book }): React.ReactElement {
  const [error, setError] = useState('');
  const [generatedExerciseCount, setGeneratedExerciseCount] = useState(0);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const [isDeletingTemplates, setIsDeletingTemplates] = useState(false);
  const [isGeneratingExercises, setIsGeneratingExercises] = useState(false);
  const [pageSkills, setPageSkills] = useState<PageSkills[]>([]);
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);

  useEffect(() => {
    let active = true;

    setError('');
    setPageSkills([]);

    getBookPages(book.id)
      .then(async (pages) => Promise.all(pages
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(async (page) => {
          const [concepts, exercises] = await Promise.all([
            getConceptsForBookPage(book.id, page.pageNumber),
            getBookExercisesForBookPage([page.pageNumber])
          ]);

          return { concepts, exercises, page };
        })))
      .then((skills) => active && setPageSkills(skills))
      .catch(() => active && setError('Unable to load skills for this book.'));

    return () => {
      active = false;
    };
  }, [book.id]);

  const conceptCount = pageSkills.reduce((count, { concepts }) => count + concepts.length, 0);
  const exerciseCount = pageSkills.reduce((count, { exercises }) => count + exercises.length, 0);
  const conceptModuleIds = useMemo(
    () => pageSkills.flatMap(({ concepts }) => concepts
      .filter(({ id }) => id !== undefined)
      .map(({ id }) => conceptTemplateModuleId(book.id, id as number))),
    [book.id, pageSkills]
  );
  const templateCount = useLiveQuery(
    async () => (await Promise.all(conceptModuleIds.map(getSkillTemplates))).reduce((count, templates) => count + templates.length, 0),
    [conceptModuleIds]
  );
  const chapterSkills = pageSkills.reduce<ChapterSkills[]>((groups, { concepts, exercises, page }) => {
    if (!concepts.length && !exercises.length) {
      return groups;
    }

    const previous = groups[groups.length - 1];

    if (previous?.chapter === page.chapter) {
      previous.concepts.push(...concepts);
      previous.exercises.push(...exercises);
    } else {
      groups.push({ chapter: page.chapter, concepts: [...concepts], exercises: [...exercises] });
    }

    return groups;
  }, []);

  const generateExercises = useCallback(async (): Promise<void> => {
    if (!conceptCount || isGeneratingExercises) {
      return;
    }

    setError('');
    setIsGeneratingExercises(true);
    setGeneratedExerciseCount(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
          'HTTP-Referer': window.location.origin,
          'X-OpenRouter-Title': 'Slonig'
        }
      });
      const allConcepts = pageSkills.flatMap(({ concepts }) => concepts).filter(({ id }) => id !== undefined) as Array<Concept & { id: number }>;
      const existingTemplates = await Promise.all(allConcepts.map(({ id }) => getSkillTemplates(conceptTemplateModuleId(book.id, id))));
      const concepts = allConcepts.filter((_, index) => !existingTemplates[index].length);
      let failures = 0;
      let lastFailure = '';

      setGeneratedExerciseCount(allConcepts.length - concepts.length);

      for (let start = 0; start < concepts.length; start += CONCEPT_BATCH_SIZE) {
        const batch = concepts.slice(start, start + CONCEPT_BATCH_SIZE);
        const conceptsPrompt = batch.map(({ description, title }, index) => `${index + 1}. ${JSON.stringify({ description, title })}`).join('\n');

        if (start > 0) {
          await delay(BATCH_REQUEST_INTERVAL_MS);
        }

        try {
          const response = await client.chat.completions.create({
            messages: [{
              content: `${conceptsToSkillsPrompt}\n\nReturn exactly ${batch.length} skill templates in the JSON array, in the same order as the concepts below.\n\nConcepts:\n${conceptsPrompt}`,
              role: 'user'
            }],
            model: selectedModel
          });
          const content = response.choices[0].message?.content?.trim();

          if (!content) {
            throw new Error('OpenRouter returned no skill templates.');
          }

          const templates = parseGeneratedSkillTemplates(content, batch.length);

          await Promise.all(templates.map((template, index) => storeSkillTemplate(
            conceptTemplateModuleId(book.id, batch[index].id),
            JSON.stringify(template)
          )));
          setGeneratedExerciseCount((count) => count + batch.length);
        } catch (batchError) {
          failures += batch.length;
          lastFailure = batchError instanceof Error ? batchError.message : 'Unable to generate exercises.';
        }
      }

      if (failures) {
        setError(`${failures} of ${allConcepts.length} concepts could not have exercises generated. ${lastFailure}`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingExercises(false);
    }
  }, [book.id, conceptCount, isGeneratingExercises, pageSkills, selectedModel]);

  const clearSkillTemplates = useCallback(async (): Promise<void> => {
    setIsDeletingTemplates(true);

    try {
      await Promise.all(conceptModuleIds.map(deleteSkillTemplates));
      setIsClearConfirmationOpen(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete skill templates.');
    } finally {
      setIsDeletingTemplates(false);
    }
  }, [conceptModuleIds]);
  const closeClearConfirmation = useCallback(() => {
    setIsClearConfirmationOpen(false);
  }, []);
  const confirmClearSkillTemplates = useCallback(() => {
    clearSkillTemplates().catch(console.error);
  }, [clearSkillTemplates]);
  const openClearConfirmation = useCallback(() => {
    setIsClearConfirmationOpen(true);
  }, []);

  return <StyledSkills>
    <div className='heading'>
      <h2>Skills</h2>
      <div className='generationControls'>
        <Dropdown
          className='modelSelect'
          isDisabled={!conceptCount || isGeneratingExercises}
          onChange={setSelectedModel}
          options={OPENAI_MODELS}
          value={selectedModel}
        />
        <Button
          icon='magic'
          isDisabled={!conceptCount || isGeneratingExercises || isDeletingTemplates}
          label={isGeneratingExercises ? `Generating exercises… ${generatedExerciseCount}/${conceptCount}` : 'Generate exercises'}
          onClick={generateExercises}
        />
        {!!templateCount && <Button
          icon='trash-can'
          isDisabled={isGeneratingExercises || isDeletingTemplates}
          label={isDeletingTemplates ? 'Deleting templates…' : 'Delete all templates'}
          onClick={openClearConfirmation}
        />}
      </div>
    </div>
    {error && <p className='errorMessage' role='alert'>{error}</p>}
    {conceptCount || exerciseCount
      ? chapterSkills.map(({ chapter, concepts, exercises }, index) => <section key={`${chapter || 'skills'}-${index}`}>
          {chapter && <h3>{chapter}</h3>}
          {!!concepts.length && <>
            <h4>Concepts</h4>
            <ul>{concepts.map((concept) => <li key={concept.id}>
              <strong>{concept.title}</strong>
              {concept.description && <p>{concept.description}</p>}
              <ConceptSkillTemplates bookId={book.id} conceptId={concept.id} />
            </li>)}</ul>
          </>}
          {!!exercises.length && <>
            <h4>Book exercises</h4>
            <ul>{exercises.map((exercise) => <li key={exercise.id}>
              <strong>{exercise.title}</strong>
              {exercise.description && <p>{exercise.description}</p>}
            </li>)}</ul>
          </>}
        </section>)
      : !error && <p className='emptyOutput'>No concepts or book exercises have been generated for this book.</p>}
    {isClearConfirmationOpen && <Confirmation
      onClose={closeClearConfirmation}
      onConfirm={confirmClearSkillTemplates}
      question='Delete all skill templates for this book?'
    />}
  </StyledSkills>;
}

const StyledSkills = styled.div`
  background: var(--bg-page);
  border-radius: 0.5rem;
  padding: 1.5rem 2rem;

  .heading {
    align-items: center;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-top: 0;
  }

  .heading h2 {
    margin: 0;
  }

  .generationControls {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .modelSelect {
    min-width: 12rem;
  }

  section + section {
    border-top: 1px solid var(--border-table);
    margin-top: 1.5rem;
    padding-top: 1rem;
  }

  h3 {
    margin-bottom: 0.75rem;
  }

  li + li {
    margin-top: 1rem;
  }

  li p {
    margin: 0.25rem 0 0;
  }

  .conceptTemplates {
    border-left: 2px solid var(--border-table);
    margin-top: 0.75rem;
    padding-left: 0.75rem;
  }

  .conceptTemplates h4 {
    margin: 0 0 0.4rem;
  }

  .skillTemplate + .skillTemplate {
    border-top: 1px solid var(--border-table);
    margin-top: 0.75rem;
    padding-top: 0.75rem;
  }

  .skillTemplate h5 {
    margin: 0.5rem 0;
  }

  @media only screen and (max-width: 700px) {
    .heading,
    .generationControls {
      align-items: stretch;
      flex-direction: column;
    }
  }
`;

export default React.memo(Skills);
