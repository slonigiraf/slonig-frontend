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

export interface StandardsFixInput extends CurriculumStandard {
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

export const STANDARDS_MATCH_RUNS = 3;
export const STANDARDS_FIX_RUNS = 3;

const STANDARDS_MATCH_CANDIDATE_LIMIT = 80;
const STANDARDS_MATCH_PER_CONCEPT_LIMIT = 12;
const STANDARDS_RETRIEVAL_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'each', 'either', 'every', 'example', 'examples', 'for', 'from', 'had', 'has', 'have', 'having', 'how', 'if', 'in', 'into',
  'is', 'it', 'its', 'may', 'more', 'most', 'must', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'out', 'over', 'same', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'use', 'used', 'using', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your'
]);

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

function standardsRetrievalToken (value: string): string {
  if (value.length > 4 && value.endsWith('ies')) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.length > 3 && value.endsWith('s') && !value.endsWith('ss') && !value.endsWith('sis') && !value.endsWith('us')) {
    return value.slice(0, -1);
  }

  return value;
}

function standardsRetrievalTokens (value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !STANDARDS_RETRIEVAL_STOP_WORDS.has(token))
    .map(standardsRetrievalToken);
}

function parentStandardCode (framework: StandardsFramework, code: string): string | undefined {
  if (framework === 'ccss') {
    const match = /^(CCSS\..+\.\d+)[a-z]$/i.exec(code);

    return match?.[1];
  }

  if (framework === 'vaSol') {
    const match = /^(VA SOL\..+\.\d+)\.[a-z]$/i.exec(code);

    return match?.[1];
  }

  return undefined;
}

export function standardsCandidateShortlist (concepts: StandardsConceptInput[], catalog: StandardsCatalog, candidateLimit = STANDARDS_MATCH_CANDIDATE_LIMIT): StandardsCandidate[] {
  if (catalog.standards.length <= candidateLimit || !concepts.length) {
    return catalog.standards;
  }

  const documentTokens = catalog.standards.map(({ context, description }) => new Set(standardsRetrievalTokens(`${context} ${description}`)));
  const documentFrequency = new Map<string, number>();

  documentTokens.forEach((tokens) => {
    tokens.forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1));
  });

  const inverseDocumentFrequency = (token: string): number => Math.log((catalog.standards.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1;
  const aggregateScores = catalog.standards.map(() => 0);
  const selected = new Set<number>();

  concepts.forEach(({ description, title }) => {
    const titleTokens = new Set(standardsRetrievalTokens(title));
    const conceptTokens = new Set([...titleTokens, ...standardsRetrievalTokens(description)]);
    const normalizedTitle = standardsRetrievalTokens(title).join(' ');
    const scores = catalog.standards.map(({ context, description: standardDescription }, index) => {
      let score = 0;

      conceptTokens.forEach((token) => {
        if (documentTokens[index].has(token)) {
          score += inverseDocumentFrequency(token) * (titleTokens.has(token) ? 6 : 1);
        }
      });

      if (normalizedTitle) {
        const normalizedCandidate = standardsRetrievalTokens(`${context} ${standardDescription}`).join(' ');

        if (` ${normalizedCandidate} `.includes(` ${normalizedTitle} `)) {
          score += 18;
        }
      }

      aggregateScores[index] += score;

      return { index, score };
    });

    scores
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, STANDARDS_MATCH_PER_CONCEPT_LIMIT)
      .forEach(({ index }) => selected.add(index));
  });

  aggregateScores
    .map((score, index) => ({ index, score }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, candidateLimit)
    .forEach(({ index }) => selected.add(index));

  const codeToIndex = new Map(catalog.standards.map(({ code }, index) => [code, index]));

  [...selected].forEach((index) => {
    const parentCode = parentStandardCode(catalog.framework, catalog.standards[index].code);
    const parentIndex = parentCode === undefined ? undefined : codeToIndex.get(parentCode);

    if (parentIndex !== undefined) {
      selected.add(parentIndex);
      aggregateScores[parentIndex] = Math.max(aggregateScores[parentIndex], aggregateScores[index] * 0.95);
    }
  });

  return [...selected]
    .sort((a, b) => aggregateScores[b] - aggregateScores[a] || a - b)
    .map((index) => catalog.standards[index]);
}

export function standardsMatchingPrompt (chapterTitle: string, concepts: StandardsConceptInput[], catalog: StandardsCatalog): string {
  const candidates = standardsCandidateShortlist(concepts, catalog);

  return `Select the strongest directly matching ${catalog.label} standards for this chapter from the authoritative candidate list supplied below.

IMPORTANT:
- Match against the supplied chapter concepts: use both each concept title and description.
- The candidate standards below are an automatically retrieved subset of the authoritative catalog and are the complete set of codes you may return. Never invent, rewrite, approximate, or complete a standard code from memory.
- Return only codes that appear verbatim in the candidate list.
- Choose the smallest useful set of strongest matches. Include multiple standards when distinct chapter concepts genuinely require them, but exclude standards that are merely related, prerequisite, broader, narrower, or keyword-similar.
- Prefer a specific content standard over a broad practice/process standard when both could describe the same concept, unless the practice/process standard is itself directly taught by the concepts.
- Match the standard's required action and scope, not just its nouns. A shared word such as "variable", "expression", "term", or "coefficient" is not enough by itself.
- A definition or identifying example does not by itself teach evaluation, solving equations or inequalities, generating equivalent expressions, applying properties, or other procedural skills unless a supplied concept explicitly teaches that action.
- Treat every candidate independently. Do not select a standard merely because it is nearby in grade, topic, or code hierarchy.
- If no candidate directly matches the concepts, return an empty array.

Return only valid JSON in exactly this shape:
{"codes":[]}

Chapter: ${chapterTitle}
Concepts: ${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}
Candidate standards (${catalog.framework}) from ${catalog.path}: ${JSON.stringify(candidates)}`;
}

export function standardsFixInputs (standards: CurriculumStandard[], catalogs: StandardsCatalog[]): StandardsFixInput[] {
  const candidates = new Map<string, StandardsCandidate>();

  catalogs.forEach(({ framework, standards: catalogStandards }) => {
    catalogStandards.forEach((standard) => candidates.set(`${framework}:${standard.code}`, standard));
  });

  return standards.map(({ code, framework }) => {
    const candidate = candidates.get(`${framework}:${code}`);

    return {
      code,
      context: candidate?.context ?? '',
      description: candidate?.description ?? '',
      framework
    };
  });
}

export function standardsFixPrompt (chapterTitle: string, concepts: StandardsConceptInput[], standards: StandardsFixInput[]): string {
  return `Review every standard currently assigned to this chapter and independently decide whether the chapter concepts directly support keeping it.

IMPORTANT:
- Use the supplied Concepts JSON as the only evidence for what this chapter introduces or teaches.
- Use the supplied Standards JSON as the complete set of standards you must review. Return exactly one decision for every supplied standard.
- Review each standard independently. Do not remove a directly supported standard because another standard is more specific, overlaps it, belongs to another framework, or appears to be a better match.
- Set keep=false when a standard is broad, vague, generic, practice/process-oriented, or only loosely related and the concepts do not directly introduce the specific knowledge or skill it names.
- Remove a standard when the chapter merely assumes it as prerequisite knowledge, mentions it incidentally, or could be described by it only through a broad interpretation.
- Match required actions, not just vocabulary. For example, defining a variable or identifying a coefficient does not by itself teach evaluating expressions, solving equations, or generating equivalent expressions.
- Set keep=true only when at least one supplied concept title or description directly shows that the chapter introduces or teaches the standard's central content or skill.
- This is a deletion-only review. Never add, invent, rewrite, substitute, broaden, narrow, or change a framework or code. It is valid for every decision to have keep=false.

Return only valid JSON in exactly this shape:
{"decisions":[{"framework":"ccss","code":"CCSS.6.RP.A.2","keep":true}]}

Chapter: ${chapterTitle}
Concepts JSON: ${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}
Standards JSON: ${JSON.stringify(standards)}`;
}

export function parseStandardsFixResult (content: string, standards: StandardsFixInput[]): CurriculumStandard[] {
  const parsed = parseJsonResponse(content);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenRouter returned invalid fixed standards data.');
  }

  const values = (parsed as Record<string, unknown>).decisions;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid fixed standards data.');
  }

  const allowed = new Map<string, CurriculumStandard>(standards.map(({ code, framework }) => [`${framework}:${code}`, { code, framework }]));
  const seen = new Set<string>();
  const result: CurriculumStandard[] = [];

  values.forEach((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('OpenRouter returned an invalid fixed standard.');
    }

    const { code: rawCode, framework, keep } = value as Partial<CurriculumStandard> & { keep?: unknown };
    const validFramework = STANDARD_FRAMEWORKS.find(({ key }) => key === framework)?.key;

    if (typeof rawCode !== 'string' || !validFramework || typeof keep !== 'boolean') {
      throw new Error('OpenRouter returned an invalid fixed standard.');
    }

    const code = canonicalStandardCode(validFramework, rawCode);
    const key = `${validFramework}:${code}`;
    const standard = allowed.get(key);

    if (!standard) {
      throw new Error(`OpenRouter returned ${code || 'an empty code'}, which was not present in the assigned standards.`);
    }

    if (seen.has(key)) {
      throw new Error(`OpenRouter returned more than one decision for ${code}.`);
    }

    seen.add(key);

    if (keep) {
      result.push(standard);
    }
  });

  if (seen.size !== allowed.size) {
    const missing = [...allowed.keys()].find((key) => !seen.has(key));

    throw new Error(`OpenRouter did not return a decision for ${missing?.split(':').slice(1).join(':') ?? 'an assigned standard'}.`);
  }

  return result;
}

export function mergeStandardsMatches (assignments: CurriculumStandard[][], minimumVotes = 1): CurriculumStandard[] {
  const counts = new Map<string, { standard: CurriculumStandard; votes: number }>();

  assignments.forEach((assignment) => {
    const seenInAssignment = new Set<string>();

    assignment.forEach((standard) => {
      const key = `${standard.framework}:${standard.code}`;

      if (seenInAssignment.has(key)) {
        return;
      }

      seenInAssignment.add(key);
      const count = counts.get(key);

      counts.set(key, { standard, votes: (count?.votes ?? 0) + 1 });
    });
  });

  return [...counts.values()]
    .filter(({ votes }) => votes >= minimumVotes)
    .map(({ standard }) => standard);
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

const storageKey = (bookId: number): string => `knowledge-upload-book-${bookId}-standards-v4`;

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
