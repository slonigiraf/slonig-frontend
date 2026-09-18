// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface BookConcept {
  id?: number;
  /** [bookId, pageNumber]; pageNumber 0 means a manually added concept has no page. */
  bookPage: [number, number];
  chapterId?: number;
  title: string;
  description: string;
  /** Chapter-local display order. Older/generated rows may omit it. */
  displayOrder?: number;
  /** True when the concept was added manually rather than generated. */
  manuallyAdded?: boolean;
}
