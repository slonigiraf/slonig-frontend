// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface BookConcept {
  id?: number;
  bookPage: [number, number];
  chapterId?: number;
  title: string;
  description: string;
}
