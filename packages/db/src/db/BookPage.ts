// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface BookPage {
  pageNumber: number;
  bookId: number;
  concepts: string;
  conceptsProcessed: boolean;
}
