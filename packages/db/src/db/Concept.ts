// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface Concept {
  id: number;
  bookPage: [number, number];
  title: string;
  description: string;
}

export type NewConcept = Omit<Concept, 'id'>;
