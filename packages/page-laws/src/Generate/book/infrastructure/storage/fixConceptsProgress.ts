// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { deleteBookFixConceptsChapterStatuses, getBookFixConceptsChapterStatuses, putBookFixConceptsChapterStatuses } from '@slonigiraf/db';
import type { ConceptChapterNavigationItem } from '../../domain/concepts/conceptRecognition.js';

export type FixConceptsChapterStatus = 'failed' | 'fixed';
export type FixConceptsChapterStatuses = Record<string, FixConceptsChapterStatus>;

export function fixConceptsChapterKey ({ chapterId, pageNumbers, title }: ConceptChapterNavigationItem): string {
  return `${chapterId ?? 'chapter'}:${title.trim()}:${pageNumbers.join(',')}`;
}

function validStatuses (value: unknown): FixConceptsChapterStatuses {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, FixConceptsChapterStatus] => entry[1] === 'fixed' || entry[1] === 'failed'));
}

export async function loadFixConceptsChapterStatuses (bookId: number): Promise<FixConceptsChapterStatuses> {
  return validStatuses(await getBookFixConceptsChapterStatuses(bookId));
}

export async function storeFixConceptsChapterStatuses (bookId: number, statuses: FixConceptsChapterStatuses): Promise<void> {
  await putBookFixConceptsChapterStatuses(bookId, validStatuses(statuses));
}

export async function clearFixConceptsChapterStatuses (bookId: number): Promise<FixConceptsChapterStatuses> {
  await deleteBookFixConceptsChapterStatuses(bookId);

  return {};
}

export async function failedFixConceptChapterKeys (bookId: number, chapters: ConceptChapterNavigationItem[]): Promise<Set<string>> {
  const statuses = await loadFixConceptsChapterStatuses(bookId);

  return new Set(chapters
    .map(fixConceptsChapterKey)
    .filter((key) => statuses[key] === 'failed'));
}
