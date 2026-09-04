// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage, Concept } from '@slonigiraf/db';

import { getBookPages, getConceptsForBookPage } from '@slonigiraf/db';
import React, { useEffect, useState } from 'react';

import { styled } from '@polkadot/react-components';

interface PageSkills {
  concepts: Concept[];
  page: BookPage;
}

interface ChapterSkills {
  chapter?: string;
  concepts: Concept[];
}

function Skills ({ book }: { book: Book }): React.ReactElement {
  const [error, setError] = useState('');
  const [pageSkills, setPageSkills] = useState<PageSkills[]>([]);

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

  return <StyledSkills>
    <h2>Skills</h2>
    {error
      ? <p className='errorMessage' role='alert'>{error}</p>
      : conceptCount
        ? chapterSkills.map(({ chapter, concepts }, index) => <section key={`${chapter || 'skills'}-${index}`}>
          {chapter && <h3>{chapter}</h3>}
          <ul>{concepts.map((concept) => <li key={concept.id}>
            <strong>{concept.title}</strong>
            {concept.description && <p>{concept.description}</p>}
          </li>)}</ul>
        </section>)
        : <p className='emptyOutput'>No concepts have been generated for this book.</p>}
  </StyledSkills>;
}

const StyledSkills = styled.div`
  background: var(--bg-page);
  border-radius: 0.5rem;
  padding: 1.5rem 2rem;

  > h2 {
    margin-top: 0;
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
`;

export default React.memo(Skills);
