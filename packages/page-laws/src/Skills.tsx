// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage, Concept } from '@slonigiraf/db';

import { getBookPages, getConceptsForBookPage, getSetting, getSkillTemplates, SettingKey, storeSkillTemplate } from '@slonigiraf/db';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useState } from 'react';

import { Button, Dropdown, styled } from '@polkadot/react-components';

import { OPENAI_MODELS, skillListPrompt } from './constants.js';
import SkillTemplateInfo from './Edit/SkillTemplateInfo.js';

const MAX_CONCEPTS_PER_MIN = 180;
const RATE_LIMIT_WINDOW_MS = 60_000;
const CONCEPT_SPAWN_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / MAX_CONCEPTS_PER_MIN);

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface GeneratedSkillTemplate {
  h: string;
  i: string;
  q: Array<{ a: string; h: string; i: string; p: string }>;
  t: number;
}

interface PageSkills {
  concepts: Concept[];
  page: BookPage;
}

interface ChapterSkills {
  chapter?: string;
  concepts: Concept[];
}

function parseGeneratedSkillTemplate (content: string): GeneratedSkillTemplate {
  const json = content.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    // Some models leave LaTeX backslashes unescaped in an otherwise valid response.
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\'));
  }

  const template = Array.isArray(parsed) ? parsed[0] : parsed;

  if (
    !template ||
    typeof template !== 'object' ||
    typeof (template as GeneratedSkillTemplate).h !== 'string' ||
    typeof (template as GeneratedSkillTemplate).i !== 'string' ||
    (template as GeneratedSkillTemplate).t !== 3 ||
    !Array.isArray((template as GeneratedSkillTemplate).q) ||
    (template as GeneratedSkillTemplate).q.length !== 2 ||
    (template as GeneratedSkillTemplate).q.some((exercise) => !exercise || typeof exercise.h !== 'string' || typeof exercise.a !== 'string' || typeof exercise.p !== 'string' || typeof exercise.i !== 'string')
  ) {
    throw new Error('OpenRouter returned an invalid skill template.');
  }

  return template as GeneratedSkillTemplate;
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

  return <div className='conceptTemplates'>
    <h4>Generated exercises</h4>
    {skillTemplates.map((skillTemplate) => <SkillTemplateInfo
      key={skillTemplate.id}
      skillTemplate={skillTemplate}
    />)}
  </div>;
}

function Skills ({ book }: { book: Book }): React.ReactElement {
  const [error, setError] = useState('');
  const [generatedExerciseCount, setGeneratedExerciseCount] = useState(0);
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
        .map(async (page) => ({
          concepts: await getConceptsForBookPage(book.id, page.pageNumber),
          page
        }))))
      .then((skills) => active && setPageSkills(skills))
      .catch(() => active && setError('Unable to load skills for this book.'));

    return () => {
      active = false;
    };
  }, [book.id]);

  const conceptCount = pageSkills.reduce((count, { concepts }) => count + concepts.length, 0);
  const chapterSkills = pageSkills.reduce<ChapterSkills[]>((groups, { concepts, page }) => {
    if (!concepts.length) {
      return groups;
    }

    const previous = groups[groups.length - 1];

    if (previous?.chapter === page.chapter) {
      previous.concepts.push(...concepts);
    } else {
      groups.push({ chapter: page.chapter, concepts: [...concepts] });
    }

    return groups;
  }, []);

  const generateExercises = useCallback(async (): Promise<void> => {
    if (!conceptCount || isGeneratingExercises) {
      return;
    }

    setError('');

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
      const concepts = pageSkills.flatMap(({ concepts }) => concepts).filter(({ id }) => id !== undefined) as Array<Concept & { id: number }>;
      const exerciseTasks: Array<Promise<void>> = [];

      setIsGeneratingExercises(true);
      setGeneratedExerciseCount(0);

      for (const [index, concept] of concepts.entries()) {
        if (index > 0) {
          await delay(CONCEPT_SPAWN_INTERVAL_MS);
        }

        exerciseTasks.push((async () => {
          const response = await client.chat.completions.create({
            messages: [{
              content: `${skillListPrompt}\n\nCreate exactly one skill template for the concept below. There are no source images: use only this concept and its description. The template must train this precise concept, be self-contained, and contain exactly two parameterized, original exercises. Return only one valid JSON object, not an array or markdown, using this exact shape: {"i":"","t":3,"h":"Skill name","q":[{"h":"Exercise text","a":"Exercise answer","p":"","i":""},{"h":"Exercise text","a":"Exercise answer","p":"","i":""}]}.\n\nConcept title: ${concept.title}\nConcept description: ${concept.description}`,
              role: 'user'
            }],
            model: selectedModel,
            response_format: { type: 'json_object' }
          });
          const content = response.choices[0].message?.content?.trim();

          if (!content) {
            throw new Error('OpenRouter returned no skill template.');
          }

          const template = parseGeneratedSkillTemplate(content);

          await storeSkillTemplate(conceptTemplateModuleId(book.id, concept.id), JSON.stringify(template));
          setGeneratedExerciseCount((count) => count + 1);
        })());
      }

      const results = await Promise.allSettled(exerciseTasks);
      const failures = results.filter(({ status }) => status === 'rejected').length;

      if (failures) {
        setError(`${failures} of ${concepts.length} concepts could not have exercises generated.`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingExercises(false);
    }
  }, [book.id, conceptCount, isGeneratingExercises, pageSkills, selectedModel]);

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
          isDisabled={!conceptCount || isGeneratingExercises}
          label={isGeneratingExercises ? `Generating exercises… ${generatedExerciseCount}/${conceptCount}` : 'Generate exercises'}
          onClick={generateExercises}
        />
      </div>
    </div>
    {error && <p className='errorMessage' role='alert'>{error}</p>}
    {conceptCount
      ? chapterSkills.map(({ chapter, concepts }, index) => <section key={`${chapter || 'skills'}-${index}`}>
          {chapter && <h3>{chapter}</h3>}
          <ul>{concepts.map((concept) => <li key={concept.id}>
            <strong>{concept.title}</strong>
            {concept.description && <p>{concept.description}</p>}
            <ConceptSkillTemplates bookId={book.id} conceptId={concept.id} />
          </li>)}</ul>
        </section>)
      : !error && <p className='emptyOutput'>No concepts have been generated for this book.</p>}
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

  @media only screen and (max-width: 700px) {
    .heading,
    .generationControls {
      align-items: stretch;
      flex-direction: column;
    }
  }
`;

export default React.memo(Skills);
