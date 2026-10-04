// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookSubject } from '@slonigiraf/db';

import { canonicalStandardCode, standardsPathForBookSubject, type StandardsCandidate, type StandardsCatalog, type StandardsFramework } from '../../domain/standards/standards.js';

interface StandardsSource {
  framework: StandardsFramework;
  label: string;
  path: string;
  url: URL;
}

const MATH_STANDARDS_SOURCES: ReadonlyArray<StandardsSource> = [
  {
    framework: 'ccss',
    label: 'Common Core State Standards',
    path: 'data/standards/en/math/common-core.json',
    url: new URL('../../../../data/standards/en/math/common-core.json', import.meta.url)
  },
  {
    framework: 'teks',
    label: 'Texas Essential Knowledge and Skills',
    path: 'data/standards/en/math/teks.json',
    url: new URL('../../../../data/standards/en/math/teks.json', import.meta.url)
  },
  {
    framework: 'vaSol',
    label: 'Virginia Standards of Learning',
    path: 'data/standards/en/math/virginia.json',
    url: new URL('../../../../data/standards/en/math/virginia.json', import.meta.url)
  }
];

const catalogCache = new Map<string, Promise<StandardsCatalog>>();

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

function standardsSourcesForBookSubject (subject: BookSubject | undefined): ReadonlyArray<StandardsSource> {
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
