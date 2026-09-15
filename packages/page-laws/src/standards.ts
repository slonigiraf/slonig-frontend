// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export type StandardsFramework = 'ccss' | 'ngss' | 'teks' | 'vaSol';

export interface CurriculumStandard {
  code: string;
  framework: StandardsFramework;
}

export interface StoredChapterStandards {
  conceptFingerprint: string;
  standards: CurriculumStandard[];
}

export type StoredBookStandards = Record<string, StoredChapterStandards>;

export interface StandardsConceptInput {
  description: string;
  title: string;
}

export const STANDARD_FRAMEWORKS: ReadonlyArray<{ key: StandardsFramework; label: string }> = [
  { key: 'ccss', label: 'Common Core State Standards' },
  { key: 'ngss', label: 'Next Generation Science Standards' },
  { key: 'teks', label: 'Texas Essential Knowledge and Skills' },
  { key: 'vaSol', label: 'Virginia Standards of Learning' }
];

const STANDARD_CODE_PATTERNS: Record<StandardsFramework, RegExp> = {
  ccss: /^CCSS\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/,
  ngss: /^NGSS\.(?:K|[1-9]|1[0-2]|MS|HS)-[A-Z]+\d*-[A-Za-z0-9-]+$/,
  teks: /^TEKS\.[A-Z]+\.[A-Za-z0-9-]+\.\d+(?:\.[A-Za-z0-9]+)+$/,
  vaSol: /^VA SOL\.[A-Z]+(?:\.[A-Za-z0-9-]+){2,}$/
};

function normalizedCode (value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const code = value.replace(/\s+/g, ' ').trim();

  return code || undefined;
}

export function conceptFingerprint (concepts: StandardsConceptInput[]): string {
  const source = concepts
    .map(({ description, title }) => `${title.trim()}\u001e${description.trim()}`)
    .join('\u001f');
  let hash = 2166136261;

  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }

  return `${concepts.length}:${(hash >>> 0).toString(16)}`;
}

export function standardsChapterKey (chapterId: number | undefined, title: string, pageNumbers: number[]): string {
  return chapterId === undefined ? `pages:${pageNumbers.join(',')}:${title.trim()}` : `id:${chapterId}`;
}

export function parseStandardsCompatibility (content: string): StandardsFramework[] {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\'));
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenRouter returned invalid standards compatibility data.');
  }

  const root = parsed as Record<string, unknown>;
  const validKeys = new Set<StandardsFramework>(STANDARD_FRAMEWORKS.map(({ key }) => key));
  const requested = new Set<StandardsFramework>();
  const compatibility = root.compatibility;

  // Preferred shape: an explicit yes/no decision for every framework. This prevents
  // a model from treating compatibility as a single-choice classification and
  // accidentally dropping TEKS or Virginia SOL after finding a CCSS match.
  if (compatibility && typeof compatibility === 'object' && !Array.isArray(compatibility)) {
    const compatibilityMap = compatibility as Record<string, unknown>;

    for (const { key } of STANDARD_FRAMEWORKS) {
      const value = compatibilityMap[key];

      if (typeof value !== 'boolean') {
        throw new Error(`OpenRouter did not return a compatibility decision for ${key}.`);
      }

      if (value) {
        requested.add(key);
      }
    }

    return STANDARD_FRAMEWORKS.flatMap(({ key }) => requested.has(key) ? [key] : []);
  }

  // Backward-compatible parser for responses produced by older prompts.
  const compatible = root.compatible;

  if (!Array.isArray(compatible)) {
    throw new Error('OpenRouter returned invalid standards compatibility data.');
  }

  for (const value of compatible) {
    if (typeof value !== 'string' || !validKeys.has(value as StandardsFramework)) {
      throw new Error('OpenRouter returned an unknown standards framework.');
    }

    requested.add(value as StandardsFramework);
  }

  return STANDARD_FRAMEWORKS.flatMap(({ key }) => requested.has(key) ? [key] : []);
}

export function completeStandardsCompatibility (frameworks: StandardsFramework[]): StandardsFramework[] {
  const compatible = new Set<StandardsFramework>(frameworks);

  // CCSS covers mathematics and ELA/literacy, while NGSS covers science. TEKS and
  // Virginia SOL both contain corresponding K-12 subject standards, so either a
  // CCSS or NGSS match is enough to make those two state frameworks valid
  // crosswalk targets even when the model's compatibility pass under-selects.
  if (compatible.has('ccss') || compatible.has('ngss')) {
    compatible.add('teks');
    compatible.add('vaSol');
  }

  return STANDARD_FRAMEWORKS.flatMap(({ key }) => compatible.has(key) ? [key] : []);
}

export function parseStandardsAssignment (content: string): CurriculumStandard[] {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\'));
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenRouter returned invalid standards data.');
  }

  const root = parsed as Record<string, unknown>;
  const standards = root.standards;

  if (!standards || typeof standards !== 'object' || Array.isArray(standards)) {
    throw new Error('OpenRouter returned invalid standards data.');
  }

  const source = standards as Record<string, unknown>;
  const result: CurriculumStandard[] = [];
  const seen = new Set<string>();

  for (const { key } of STANDARD_FRAMEWORKS) {
    const values = source[key];

    if (values === undefined) {
      continue;
    }

    if (!Array.isArray(values)) {
      throw new Error('OpenRouter returned invalid standards data.');
    }

    values.forEach((value) => {
      const code = normalizedCode(value);

      if (!code || !STANDARD_CODE_PATTERNS[key].test(code)) {
        throw new Error(`OpenRouter returned an invalid ${key} standard code.`);
      }

      const uniqueKey = `${key}:${code}`;

      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        result.push({ code, framework: key });
      }
    });
  }

  return result;
}

export function standardsCompatibilityPrompt (chapterTitle: string, concepts: StandardsConceptInput[]): string {
  return `Evaluate EACH United States education standards framework below independently against the supplied chapter concepts. This is only a compatibility pass: do not return standard codes yet.

IMPORTANT:
- This is NOT a single-choice classification. Multiple frameworks can and often should be compatible with the same chapter.
- A framework is compatible when it contains standards for the same academic subject and approximate grade/band represented by the concepts.
- Do NOT reject TEKS because the source material is not from Texas, and do NOT reject Virginia SOL because the source material is not from Virginia. We are mapping concepts across standards systems, not determining the learner's jurisdiction.
- For mathematics/ELA chapters, CCSS, TEKS, and Virginia SOL may all be compatible when their subject/grade scope matches.
- For science chapters, NGSS, TEKS, and Virginia SOL may all be compatible when their subject/grade scope matches.
- Judge every framework separately even if you already marked another framework true.

Framework keys, in required order:
1. ccss — Common Core State Standards
2. ngss — Next Generation Science Standards
3. teks — Texas Essential Knowledge and Skills
4. vaSol — Virginia Standards of Learning

Return only valid JSON in exactly this shape, with ALL four keys present:
{"compatibility":{"ccss":true,"ngss":false,"teks":true,"vaSol":true}}

Chapter: ${chapterTitle}
Concepts: ${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}`;
}

export function standardsAssignmentPrompt (chapterTitle: string, concepts: StandardsConceptInput[], compatibleFrameworks: StandardsFramework[] = STANDARD_FRAMEWORKS.map(({ key }) => key)): string {
  const selected = STANDARD_FRAMEWORKS.filter(({ key }) => compatibleFrameworks.includes(key));
  const selectedLines = selected.map(({ key, label }, index) => `${index + 1}. ${label} (${key})`).join('\n');

  return `Assign every directly applicable standard you can identify for this chapter, based strictly on the supplied chapter concepts, but ONLY from the compatible frameworks selected by the prior compatibility pass. Do not invent codes, approximate codes, or return standards merely because they are adjacent to the topic.

IMPORTANT:
- Search EACH compatible framework independently. Finding CCSS codes does not satisfy the request for TEKS or Virginia SOL.
- Do not stop after the first framework with matches.
- TEKS and Virginia SOL are crosswalk targets here; do not omit them merely because the source book is not from Texas or Virginia.
- For every compatible framework, make a genuine attempt to return all directly matching codes. Use an empty array only after independently checking that framework and finding no direct match you can identify confidently.

Compatible frameworks to search, in this exact order:
${selectedLines || '(none)'}

Required code formats:
- Common Core State Standards — CCSS.6.NS.B.3
- Next Generation Science Standards — NGSS.4-ESS3-1
- Texas Essential Knowledge and Skills — TEKS.MA.6.3.D
- Virginia Standards of Learning — VA SOL.CE.6.6.a

Return only valid JSON in exactly this shape:
{"standards":{"ccss":[],"ngss":[],"teks":[],"vaSol":[]}}
Frameworks not listed as compatible above MUST remain empty arrays. Return all directly applicable codes from the compatible frameworks, deduplicated.

Chapter: ${chapterTitle}
Concepts: ${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}`;
}

const storageKey = (bookId: number): string => `knowledge-upload-book-${bookId}-standards-v1`;

export function loadStoredBookStandards (bookId: number): StoredBookStandards {
  try {
    const raw = localStorage.getItem(storageKey(bookId));

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as StoredBookStandards : {};
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
