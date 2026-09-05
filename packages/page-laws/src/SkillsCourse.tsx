import type { Book, Concept } from '@slonigiraf/db';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { getBookPages, getConceptsForBookPage, getSkillTemplates } from '@slonigiraf/db';
import { Input, styled } from '@polkadot/react-components';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useMemo, useState } from 'react';

import KnowledgeTargetSelector from './KnowledgeTargetSelector.js';
import { parseStoredSkillTemplate } from './skillTemplates.js';

interface CourseConcept extends Concept {
  chapter: string;
  template?: GeneratedSkillTemplate;
}

function SkillsCourse ({ book }: { book: Book }): React.ReactElement {
  const [courseName, setCourseName] = useState(book.name);
  const [modulePrice, setModulePrice] = useState('0');
  const [skillPrice, setSkillPrice] = useState('0');
  const [knowledgeId, setKnowledgeId] = useState('');
  const concepts = useLiveQuery(async (): Promise<CourseConcept[]> => {
    const pages = (await getBookPages(book.id)).sort((a, b) => a.pageNumber - b.pageNumber);
    const result: CourseConcept[] = [];

    for (const page of pages) {
      const pageConcepts = await getConceptsForBookPage(book.id, page.pageNumber);
      for (const concept of pageConcepts) {
        const templates = concept.id === undefined ? [] : await getSkillTemplates(`book-${book.id}-concept-${concept.id}`);
        let template: GeneratedSkillTemplate | undefined;
        try {
          template = templates[0] && parseStoredSkillTemplate(templates[0].content);
        } catch {
          template = undefined;
        }
        result.push({ ...concept, chapter: page.chapter, template });
      }
    }

    return result;
  }, [book.id]);
  const total = useMemo(() => Number(modulePrice || 0) + Number(skillPrice || 0) * (concepts?.filter(({ template }) => template).length || 0), [concepts, modulePrice, skillPrice]);

  return <StyledSkillsCourse>
    <div className='courseColumn'>
      <Input label='Course name' onChange={setCourseName} value={courseName} />
      {!concepts?.length && <p>No concepts have been generated for this book.</p>}
      {concepts?.map(({ chapter, title, description, template }, index) => <section key={`${title}-${index}`}>
        {(index === 0 || concepts[index - 1].chapter !== chapter) && <h3>{chapter || 'Unassigned chapter'}</h3>}
        <div className='skillRow'>
          <strong>{template?.h || title}</strong>
          {!template && <small>{description}</small>}
        </div>
      </section>)}
    </div>
    <aside className='courseSettings'>
      <h3>Publish course</h3>
      <KnowledgeTargetSelector onChange={setKnowledgeId} value={knowledgeId} />
      <Input label='Module insertion price' onChange={setModulePrice} type='number' value={modulePrice} />
      <Input label='Skill insertion price' onChange={setSkillPrice} type='number' value={skillPrice} />
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
