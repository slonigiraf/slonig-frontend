// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface MathpixHeading {
  confidence?: number;
  line?: number;
  text: string;
  type: 'section_header' | 'title';
}

export interface BookPage {
  pageNumber: number;
  bookId: number;
  chapter: string;
  chapterId?: number;
  conceptsProcessed: boolean;
  mathpixHeadings?: MathpixHeading[];
  pageMMD?: string;
  pageMMDZip?: Blob;
}
