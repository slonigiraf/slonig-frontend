// Copyright 2021-2026 @slonig/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, Skill } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { getBookChapters, getSkillsForChapter, getSkillTemplates } from '@slonigiraf/db';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useMemo, useState } from 'react';

import { Input, styled } from '@polkadot/react-components';

import KnowledgeTargetSelector from './KnowledgeTargetSelector.js';
import { parseStoredSkillTemplate } from './skillTemplates.js';

interface CourseSkill extends Skill {
  chapter: string;
  template?: GeneratedSkillTemplate;
}

function SkillsCourse ({ book }: { book: Book }): React.ReactElement {
  const [courseName, setCourseName] = useState(book.name);
  const [modulePrice, setModulePrice] = useState('0');
  const [skillPrice, setSkillPrice] = useState('0');
  const [knowledgeId, setKnowledgeId] = useState('');
  const skills = useLiveQuery(async (): Promise<CourseSkill[]> => {
    const chapters = await getBookChapters(book.id);
    const result: CourseSkill[] = [];

    for (const chapter of chapters) {
      if (chapter.id === undefined) {
        continue;
      }

      const chapterSkills = await getSkillsForChapter(chapter.id);

      for (const skill of chapterSkills) {
        const templates = skill.id === undefined ? [] : await getSkillTemplates(`book-${book.id}-skill-${skill.id}`);
        let template: GeneratedSkillTemplate | undefined;

        try {
          template = templates[0] && parseStoredSkillTemplate(templates[0].content);
        } catch {
          template = undefined;
        }

        result.push({ ...skill, chapter: chapter.title, template });
      }
    }

    return result;
  }, [book.id]);
  const total = useMemo(() => Number(modulePrice || 0) + Number(skillPrice || 0) * (skills?.filter(({ template }) => template).length || 0), [modulePrice, skillPrice, skills]);

  return <StyledSkillsCourse>
    <div className='courseColumn'>
      <Input
        label='Course name'
        onChange={setCourseName}
        value={courseName}
      />
      {!skills?.length && <p>No skills have been generated for this book.</p>}
      {skills?.map(({ chapter, description, template, title }, index) => <section key={`${title}-${index}`}>
        {(index === 0 || skills[index - 1].chapter !== chapter) && <h3>{chapter || 'Unassigned chapter'}</h3>}
        <div className='skillRow'>
          <strong>{template?.h || title}</strong>
          {!template && <small>{description}</small>}
        </div>
      </section>)}
    </div>
    <aside className='courseSettings'>
      <h3>Publish course</h3>
      <KnowledgeTargetSelector
        onChange={setKnowledgeId}
        value={knowledgeId}
      />
      <Input
        label='Module insertion price'
        onChange={setModulePrice}
        type='number'
        value={modulePrice}
      />
      <Input
        label='Skill insertion price'
        onChange={setSkillPrice}
        type='number'
        value={skillPrice}
      />
      <p className='total'>Estimated total: {Number.isFinite(total) ? total : 0}</p>
    </aside>
  </StyledSkillsCourse>;
}

const StyledSkillsCourse = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(18rem, 0.8fr) minmax(28rem, 1.2fr);
  padding: 1.5rem 2rem;
  background: var(--bg-page);
  border-radius: 0.5rem;
  width: 100%;

  .courseColumn section + section { margin-top: 1rem; }
  h3 { margin: 0 0 0.75rem; }
  .skillRow { border-bottom: 1px solid var(--border-table); padding: 0.5rem 0; }
  .skillRow small { display: block; margin-top: 0.25rem; }
  .courseColumn, .courseSettings { min-width: 0; }
  .courseSettings { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .courseSettings h3 { margin-bottom: 0; }
  .total { font-weight: 600; margin: 0; }
  @media only screen and (max-width: 900px) { grid-template-columns: 1fr; }
`;

export default React.memo(SkillsCourse);
