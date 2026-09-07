// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface Exercise {
  id?: number;
  abilityMode: string;
  bookPage: [number, number];
  conceptId?: number;
  title: string;
  description: string;
  solution: string;
  source?: 'book' | 'generated';
}
