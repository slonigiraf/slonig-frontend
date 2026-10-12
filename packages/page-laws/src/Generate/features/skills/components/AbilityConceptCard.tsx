// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React from 'react';

/** Shared Concept/Ability layout used in the Abilities tab and the change log. */
export default function AbilityConceptCard ({ children, concept, isSingleExercise = false, ordinal }: { children: React.ReactNode; concept?: Pick<BookConcept, 'id' | 'title' | 'description'>; isSingleExercise?: boolean; ordinal?: number }): React.ReactElement {
  return <section
    className={`abilityExerciseCard abilityConceptCard${isSingleExercise ? ' abilityConceptCardSingleExercise' : ''}`}
    data-concept-id={concept?.id}
    data-concept-rank={ordinal}
    tabIndex={-1}
  >
    <h4>{ordinal !== undefined && <span>{ordinal}. </span>}{concept ? <SpanWithTags content={concept.title} /> : 'Concept no longer available'}</h4>
    {concept?.description && <p><SpanWithTags content={concept.description} /></p>}
    <div className='matchedAbilities'>{children}</div>
  </section>;
}
