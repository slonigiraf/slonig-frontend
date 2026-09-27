// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface BookConcept {
  id?: number;
  /** [bookId, pageNumber]; pageNumber 0 means a manually added concept has no page. */
  bookPage: [number, number];
  /** Learning chapter membership. When present, this is authoritative even if bookPage points at a page assigned to another chapter. */
  chapterId?: number;
  title: string;
  description: string;
  /** Fix Concepts run that created this concept. Non-Fix concepts use attempt 0. */
  attempt?: number;
  /** Chapter-local pedagogical/display order. Sort Concepts writes ZPD order; child Exercise/Ability reorders may back-propagate and override it. */
  displayOrder?: number;
  /** True when the concept was added manually rather than generated. */
  manuallyAdded?: boolean;
}
