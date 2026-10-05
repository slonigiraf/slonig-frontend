// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A Mathpix PDF recognition request that has been submitted but whose result
 * has not yet been durably stored as BookPage rows.
 *
 * The page range is part of the primary key because recognition is submitted
 * in deterministic PDF slices. Keeping the remote pdfId in IndexedDB lets a
 * reload reconnect to the existing Mathpix job instead of paying for a second
 * submission of the same slice.
 */
export interface MathpixPdfJob {
  bookId: number;
  created: number;
  endPage: number;
  pdfId: string;
  startPage: number;
}
