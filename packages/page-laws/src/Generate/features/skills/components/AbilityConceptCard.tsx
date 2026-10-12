// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';
import { getBookConceptById } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React, { useEffect, useState } from 'react';

/** Shared Concept/Ability layout used in the Abilities tab and the change log. */
export default function AbilityConceptCard ({ children, concept, isSingleExercise = false, ordinal }: { children: React.ReactNode; concept?: Pick<BookConcept, 'id' | 'title' | 'description' | 'parentConceptId'>; isSingleExercise?: boolean; ordinal?: number }): React.ReactElement {
  const [parentTitle, setParentTitle] = useState<string>();

  useEffect(() => {
    let active = true;
    setParentTitle(undefined);
    if (concept?.parentConceptId !== undefined) {
      void getBookConceptById(concept.parentConceptId)
        .then((parent) => { if (active) setParentTitle(parent?.title); })
        .catch(() => { if (active) setParentTitle(undefined); });
    }
    return () => { active = false; };
  }, [concept?.parentConceptId]);

  return <section
    className={`abilityExerciseCard abilityConceptCard${isSingleExercise ? ' abilityConceptCardSingleExercise' : ''}`}
    data-concept-id={concept?.id}
    data-concept-rank={ordinal}
    tabIndex={-1}
  >
    <h4>{ordinal !== undefined && <span>{ordinal}. </span>}{concept ? <SpanWithTags content={concept.title} /> : 'Concept no longer available'}</h4>
    {parentTitle && <p className='abilityConceptParent'>Child of <SpanWithTags content={parentTitle} /></p>}
    {concept?.description && <p><SpanWithTags content={concept.description} /></p>}
    <div className='matchedAbilities'>{children}</div>
  </section>;
}
