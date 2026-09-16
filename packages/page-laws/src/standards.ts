// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookSubject } from '@slonigiraf/db';

import { normalizeBookSubject } from './bookSubject.js';

export type StandardsFramework = 'ccss' | 'ngss' | 'teks' | 'vaSol';

export interface CurriculumStandard {
  code: string;
  framework: StandardsFramework;
}

export interface StandardsConceptInput {
  description: string;
  title: string;
}

export interface StandardsCandidate {
  code: string;
  context: string;
  description: string;
}

export interface StandardsCatalog {
  framework: StandardsFramework;
  label: string;
  path: string;
  standards: StandardsCandidate[];
}

export interface StoredChapterStandards {
  conceptFingerprint: string;
  standards: CurriculumStandard[];
}

export type StoredBookStandards = Record<string, StoredChapterStandards>;

interface StandardsSource {
  framework: StandardsFramework;
  label: string;
  path: string;
  url: URL;
}

export const STANDARD_FRAMEWORKS: ReadonlyArray<{ key: StandardsFramework; label: string }> = [
  { key: 'ccss', label: 'Common Core State Standards' },
  { key: 'ngss', label: 'Next Generation Science Standards' },
  { key: 'teks', label: 'Texas Essential Knowledge and Skills' },
  { key: 'vaSol', label: 'Virginia Standards of Learning' }
];

const MATH_STANDARDS_SOURCES: ReadonlyArray<StandardsSource> = [
  {
    framework: 'ccss',
    label: 'Common Core State Standards',
    path: 'data/standards/en/math/common-core.json',
    url: new URL('./data/standards/en/math/common-core.json', import.meta.url)
  },
  {
    framework: 'teks',
    label: 'Texas Essential Knowledge and Skills',
    path: 'data/standards/en/math/teks.json',
    url: new URL('./data/standards/en/math/teks.json', import.meta.url)
  },
  {
    framework: 'vaSol',
    label: 'Virginia Standards of Learning',
    path: 'data/standards/en/math/virginia.json',
    url: new URL('./data/standards/en/math/virginia.json', import.meta.url)
  }
];

const catalogCache = new Map<string, Promise<StandardsCatalog>>();

function parseJsonResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

function canonicalStandardCode (framework: StandardsFramework, value: string): string {
  const code = value.replace(/\s+/g, ' ').trim();

  if (!code) {
    return '';
  }

  if (framework === 'ccss') {
    const compact = code.replace(/^CCSS\.MATH\.CONTENT\./i, 'CCSS.');

    return /^CCSS\./i.test(compact) ? compact : `CCSS.${compact}`;
  }

  if (framework === 'ngss') {
    return /^NGSS\./i.test(code) ? code : `NGSS.${code}`;
  }

  if (framework === 'teks') {
    return /^TEKS\./i.test(code) ? code : `TEKS.${code}`;
  }

  return /^VA SOL\./i.test(code) ? code : `VA SOL.${code}`;
}

function flattenStandards (framework: StandardsFramework, raw: unknown): StandardsCandidate[] {
  const result: StandardsCandidate[] = [];
  const seen = new Set<string>();

  const visit = (value: unknown, context: string[]): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, context));
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    const nextContext = [...context];

    if (typeof record.g === 'string' && record.g.trim()) {
      nextContext.push(record.g.trim());
    }

    if (typeof record.t === 'string' && record.t.trim()) {
      nextContext.push(record.t.trim());
    }

    if (typeof record.i === 'string' && typeof record.d === 'string') {
      const code = canonicalStandardCode(framework, record.i);

      if (code && !seen.has(code)) {
        seen.add(code);
        result.push({
          code,
          context: nextContext.join(' > '),
          description: record.d.trim()
        });
      }

      return;
    }

    Object.entries(record).forEach(([key, child]) => {
      if (key !== 'g' && key !== 't' && key !== 'i' && key !== 'd') {
        visit(child, nextContext);
      }
    });
  };

  visit(raw, []);

  return result;
}

export function standardsPathForBookSubject (subject: BookSubject | undefined): string | undefined {
  const normalized = normalizeBookSubject(subject);

  if (!normalized || normalized === 'na') {
    return undefined;
  }

  const [language, subjectName] = normalized.split('-');

  return `data/standards/${language}/${subjectName}`;
}

function standardsSourcesForBookSubject (subject: BookSubject | undefined): ReadonlyArray<StandardsSource> {
  // Only register files that actually exist in the bundle. Add subject directories
  // here as their standards JSON files are populated.
  switch (standardsPathForBookSubject(subject)) {
    case 'data/standards/en/math':
      return MATH_STANDARDS_SOURCES;
    default:
      return [];
  }
}

async function loadStandardsCatalog (source: StandardsSource): Promise<StandardsCatalog> {
  const cached = catalogCache.get(source.path);

  if (cached) {
    return cached;
  }

  const pending = (async (): Promise<StandardsCatalog> => {
    const response = await fetch(source.url);

    if (!response.ok) {
      throw new Error(`Unable to load standards from ${source.path}.`);
    }

    const raw = await response.json() as unknown;

    return {
      framework: source.framework,
      label: source.label,
      path: source.path,
      standards: flattenStandards(source.framework, raw)
    };
  })();

  catalogCache.set(source.path, pending);

  try {
    return await pending;
  } catch (error) {
    catalogCache.delete(source.path);
    throw error;
  }
}

export async function loadStandardsCatalogsForBookSubject (subject: BookSubject | undefined): Promise<StandardsCatalog[]> {
  return Promise.all(standardsSourcesForBookSubject(subject).map(loadStandardsCatalog));
}


export function standardsConceptInputs (concepts: StandardsConceptInput[]): StandardsConceptInput[] {
  const seen = new Set<string>();

  return concepts.flatMap(({ description, title }) => {
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    const key = `${normalizedTitle}\u001f${normalizedDescription}`;

    if (!normalizedTitle || seen.has(key)) {
      return [];
    }

    seen.add(key);

    return [{ description: normalizedDescription, title: normalizedTitle }];
  });
}

export function standardsConceptFingerprint (concepts: StandardsConceptInput[], standardsPath = ''): string {
  const source = `${standardsPath}\u001d${concepts
    .map(({ description, title }) => `${title.trim()}\u001e${description.trim()}`)
    .join('\u001f')}`;
  let hash = 2166136261;

  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }

  return `${concepts.length}:${(hash >>> 0).toString(16)}`;
}

export function standardsChapterKey (chapterId: number | undefined, title: string, pageNumbers: number[]): string {
  return chapterId === undefined ? `pages:${pageNumbers.join(',')}:${title.trim()}` : `id:${chapterId}`;
}

export function standardsMatchingPrompt (chapterTitle: string, concepts: StandardsConceptInput[], catalog: StandardsCatalog): string {
  return `Select the strongest directly matching ${catalog.label} standards for this chapter from the authoritative candidate list supplied below.

IMPORTANT:
- Match against the supplied chapter concepts: use both each concept title and description.
- The candidate standards below are the complete source of truth for this request. Never invent, rewrite, approximate, or complete a standard code from memory.
- Return only codes that appear verbatim in the candidate list.
- Choose the smallest useful set of strongest matches. Include multiple standards when distinct chapter concepts genuinely require them, but exclude standards that are merely related, prerequisite, broader, narrower, or keyword-similar.
- Prefer a specific content standard over a broad practice/process standard when both could describe the same concept, unless the practice/process standard is itself directly taught by the concepts.
- If no candidate directly matches the concepts, return an empty array.

Return only valid JSON in exactly this shape:
{"codes":[]}

Chapter: ${chapterTitle}
Concepts: ${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}
Candidate standards (${catalog.framework}) from ${catalog.path}: ${JSON.stringify(catalog.standards)}`;
}

export function parseStandardsMatches (content: string, catalog: StandardsCatalog): CurriculumStandard[] {
  const parsed = parseJsonResponse(content);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`OpenRouter returned invalid ${catalog.framework} standards matching data.`);
  }

  const codes = (parsed as Record<string, unknown>).codes;

  if (!Array.isArray(codes)) {
    throw new Error(`OpenRouter returned invalid ${catalog.framework} standards matching data.`);
  }

  const allowed = new Set(catalog.standards.map(({ code }) => code));
  const seen = new Set<string>();
  const result: CurriculumStandard[] = [];

  codes.forEach((value) => {
    if (typeof value !== 'string') {
      throw new Error(`OpenRouter returned an invalid ${catalog.framework} standard code.`);
    }

    const code = canonicalStandardCode(catalog.framework, value);

    if (!allowed.has(code)) {
      throw new Error(`OpenRouter returned ${code || 'an empty code'}, which is not present in ${catalog.path}.`);
    }

    if (!seen.has(code)) {
      seen.add(code);
      result.push({ code, framework: catalog.framework });
    }
  });

  return result;
}

const storageKey = (bookId: number): string => `knowledge-upload-book-${bookId}-standards-v3`;

export function loadStoredBookStandards (bookId: number): StoredBookStandards {
  try {
    const raw = localStorage.getItem(storageKey(bookId));

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: StoredBookStandards = {};

    Object.entries(parsed as Record<string, unknown>).forEach(([chapterKey, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }

      const entry = value as Partial<StoredChapterStandards>;

      if (typeof entry.conceptFingerprint !== 'string' || !Array.isArray(entry.standards)) {
        return;
      }

      result[chapterKey] = {
        conceptFingerprint: entry.conceptFingerprint,
        standards: entry.standards.flatMap((standard) => {
          if (!standard || typeof standard !== 'object') {
            return [];
          }

          const candidate = standard as CurriculumStandard;

          if (!STANDARD_FRAMEWORKS.some(({ key }) => key === candidate.framework) || typeof candidate.code !== 'string') {
            return [];
          }

          const code = canonicalStandardCode(candidate.framework, candidate.code);

          return code ? [{ code, framework: candidate.framework }] : [];
        })
      };
    });

    return result;
  } catch {
    return {};
  }
}

export function storeBookStandards (bookId: number, standards: StoredBookStandards): void {
  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(standards));
  } catch {
    // Standards remain usable for the current session when browser storage is unavailable.
  }
}
