// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookSubject } from '@slonigiraf/db';

import { normalizeBookSubject } from '../metadata/bookSubject.js';

export type StandardsFramework = 'ccss' | 'ngss' | 'teks' | 'vaSol';

export interface CurriculumStandard {
  code: string;
  distance?: number;
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

export const STANDARD_FRAMEWORKS: ReadonlyArray<{ key: StandardsFramework; label: string }> = [
  { key: 'ccss', label: 'Common Core State Standards' },
  { key: 'ngss', label: 'Next Generation Science Standards' },
  { key: 'teks', label: 'Texas Essential Knowledge and Skills' },
  { key: 'vaSol', label: 'Virginia Standards of Learning' }
];

export const STANDARDS_MATCH_RUNS = 3;

function parseJsonResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

export function canonicalStandardCode (framework: StandardsFramework, value: string): string {
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

  const compact = code.replace(/^(?:VA\s+)?SOL\./i, '');

  return `SOL.${compact}`;
}

export function standardsPathForBookSubject (subject: BookSubject | undefined): string | undefined {
  const normalized = normalizeBookSubject(subject);

  if (!normalized || normalized === 'na') {
    return undefined;
  }

  const [language, subjectName] = normalized.split('-');

  return `data/standards/${language}/${subjectName}`;
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

export function standardsConceptEmbeddingInput ({ description, title }: StandardsConceptInput): string {
  return `${title.trim()}\n${description.trim()}`.trim();
}

export function standardEmbeddingInput ({ context, description }: StandardsCandidate): string {
  return `${context.trim()}\n${description.trim()}`.trim();
}

function vectorNorm (values: number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity (left: number[], right: number[], leftNorm = vectorNorm(left), rightNorm = vectorNorm(right)): number {
  if (!left.length || left.length !== right.length || leftNorm === 0 || rightNorm === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let dot = 0;

  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
  }

  return dot / (leftNorm * rightNorm);
}

export function embeddingCosineDistance (left: number[], right: number[], leftNorm = vectorNorm(left), rightNorm = vectorNorm(right)): number | undefined {
  const similarity = cosineSimilarity(left, right, leftNorm, rightNorm);

  return Number.isFinite(similarity) ? Math.max(0, Math.min(2, 1 - similarity)) : undefined;
}

export function standardsMatchesFromEmbeddings (conceptEmbeddings: number[][], catalog: StandardsCatalog, standardEmbeddings: ReadonlyMap<string, number[]>): CurriculumStandard[] {
  const prepared = catalog.standards.flatMap((standard) => {
    const embedding = standardEmbeddings.get(standard.code);

    if (!embedding?.length) {
      return [];
    }

    return [{ embedding, norm: vectorNorm(embedding), standard }];
  });
  const selectedCodes: string[] = [];
  const selected = new Set<string>();
  const nearestScoreByStandard = new Map<string, number>();

  for (const conceptEmbedding of conceptEmbeddings) {
    const conceptNorm = vectorNorm(conceptEmbedding);
    let best: typeof prepared[number] | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of prepared) {
      const score = cosineSimilarity(conceptEmbedding, candidate.embedding, conceptNorm, candidate.norm);

      if (Number.isFinite(score) && score > (nearestScoreByStandard.get(candidate.standard.code) ?? Number.NEGATIVE_INFINITY)) {
        nearestScoreByStandard.set(candidate.standard.code, score);
      }

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (best && Number.isFinite(bestScore) && !selected.has(best.standard.code)) {
      selected.add(best.standard.code);
      selectedCodes.push(best.standard.code);
    }
  }

  return selectedCodes.flatMap((code) => {
    const nearestScore = nearestScoreByStandard.get(code);

    if (nearestScore === undefined) {
      return [];
    }

    return [{
      code,
      distance: Math.max(0, Math.min(2, 1 - nearestScore)),
      framework: catalog.framework
    }];
  });
}


export function standardsCandidatesFromEmbeddings (conceptEmbeddings: number[][], catalog: StandardsCatalog, standardEmbeddings: ReadonlyMap<string, number[]>): { catalog: StandardsCatalog; matches: CurriculumStandard[] } {
  const matches = standardsMatchesFromEmbeddings(conceptEmbeddings, catalog, standardEmbeddings);
  const selectedCodes = new Set(matches.map(({ code }) => code));

  return {
    catalog: {
      ...catalog,
      standards: catalog.standards.filter(({ code }) => selectedCodes.has(code))
    },
    matches
  };
}

export function standardsMatchingPrompt (chapterTitle: string, concepts: StandardsConceptInput[], catalog: StandardsCatalog): string {
  return `Select the strongest directly matching ${catalog.label} standards for this chapter from the embedding-retrieved candidate list supplied below.

IMPORTANT:
- Match against the supplied chapter concepts: use both each concept title and description.
- The candidate standards below were preselected by embedding similarity from the authoritative catalog. They are the complete set of codes you may return for this request.
- Never invent, rewrite, approximate, or complete a standard code from memory. Return only codes that appear verbatim in the candidate list.
- Choose the smallest useful set of strongest direct matches. Include multiple standards when distinct chapter concepts genuinely require them, but exclude standards that are merely related, prerequisite, broader, narrower, or keyword-similar.
- Prefer a specific content standard over a broad practice/process standard when both could describe the same concept, unless the practice/process standard is itself directly taught by the concepts.
- Match the standard's required action and scope, not just its nouns. A shared word such as "variable", "expression", "term", or "coefficient" is not enough by itself.
- A definition or identifying example does not by itself teach evaluation, solving equations or inequalities, generating equivalent expressions, applying properties, or other procedural skills unless a supplied concept explicitly teaches that action.
- Treat every candidate independently. Do not select a standard merely because it is nearby in grade, topic, or code hierarchy.
- If no candidate directly matches the concepts, return an empty array.

Return only valid JSON in exactly this shape:
{"codes":[]}

Chapter: ${chapterTitle}
Concepts: ${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}
Embedding-retrieved candidate standards (${catalog.framework}) from ${catalog.path}: ${JSON.stringify(catalog.standards)}`;
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

export function moduleStandardsText (standards: CurriculumStandard[]): string {
  const seen = new Set<string>();

  return standards.flatMap(({ code, framework }) => {
    const canonicalCode = canonicalStandardCode(framework, code);

    if (!canonicalCode || seen.has(canonicalCode)) {
      return [];
    }

    seen.add(canonicalCode);

    return [canonicalCode];
  }).join(', ');
}
