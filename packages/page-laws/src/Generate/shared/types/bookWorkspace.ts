// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';

export type ReaderPane = 'age' | 'chapters' | 'conceptsSkills' | 'embeddings' | 'language' | 'subject' | 'pdf' | 'preExercisesExercises' | 'skillsCourse' | 'standards' | 'text' | 'textConcepts';

export type RecognitionTarget = 'all' | 'page';

export interface ReaderEntityCounts {
  abilities: number;
  concepts: number;
}

export interface ConceptEmbeddingHeatmapEntry {
  concept: BookConcept;
  embedding: number[];
  norm: number;
}

