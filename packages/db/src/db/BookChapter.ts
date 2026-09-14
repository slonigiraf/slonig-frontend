// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** A chapter identified within a book. */
export interface BookChapter {
  id?: number;
  bookId: number;
  confidence?: number;
  knowledgeId?: string;
  source?: 'ai' | 'legacy' | 'manual';
  title: string;
}
