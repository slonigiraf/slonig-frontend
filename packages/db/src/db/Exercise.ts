// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface Exercise {
  id?: number;
  bookPage: [number, number];
  conceptId?: number;
  /** Chapter-local learning order. Reordering an Exercise also back-propagates to its parent BookConcept. */
  displayOrder?: number;
  title: string;
  description: string;
  imageDescription?: string;
  solution: string;
  solutionImageDescription?: string;
  source?: 'book' | 'generated';
}
