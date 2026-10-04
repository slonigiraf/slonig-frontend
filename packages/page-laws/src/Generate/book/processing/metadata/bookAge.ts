// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const MIN_BOOK_LEARNER_AGE = 3;
export const MAX_BOOK_LEARNER_AGE = 30;

function parseJsonResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

export function normalizeBookAge (value: unknown): number | undefined {
  const age = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : NaN;

  return Number.isSafeInteger(age) && age >= MIN_BOOK_LEARNER_AGE && age <= MAX_BOOK_LEARNER_AGE
    ? age
    : undefined;
}

export function parseDetectedBookAge (content: string): number {
  const parsed = parseJsonResponse(content);
  let value: unknown = parsed;

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;

    value = record.age ?? record.learnerAge ?? record.recommendedAge;
  }

  const age = normalizeBookAge(value);

  if (age === undefined) {
    throw new Error('OpenRouter returned an invalid learner age.');
  }

  return age;
}

export function bookAgeLabel (age?: number): string {
  return normalizeBookAge(age) === undefined ? 'Learner age not detected' : `${age} years`;
}

export function getBookAgeSamplePageNumbers (totalPages: number, availablePageNumbers?: number[]): number[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    return [];
  }

  const available = availablePageNumbers === undefined
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : Array.from(new Set(availablePageNumbers.filter((pageNumber) => Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages))).sort((a, b) => a - b);

  if (available.length <= 3) {
    return available;
  }

  const targets = [totalPages * 0.25, totalPages * 0.5, totalPages * 0.75];
  const selected: number[] = [];

  for (const target of targets) {
    const candidate = available
      .filter((pageNumber) => !selected.includes(pageNumber))
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];

    if (candidate !== undefined) {
      selected.push(candidate);
    }
  }

  return selected.sort((a, b) => a - b);
}
