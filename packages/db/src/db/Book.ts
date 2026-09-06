// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface Book {
  id: number;
  chapterOrder?: number[];
  courseOrder?: string[];
  excludedCourseChapterIds?: number[];
  language?: string;
  knowledgeId?: string;
  publishingLocationId?: string;
  contentHash: string;
  name: string;
  opfsName: string;
  size: number;
  created: number;
}
