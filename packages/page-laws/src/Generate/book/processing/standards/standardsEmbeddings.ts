// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, ConceptEmbedding, StandardEmbedding } from '@slonigiraf/db';

import { getConceptEmbeddings, getSetting, getStandardEmbeddings, putConceptEmbeddings, putStandardEmbeddings, SettingKey, storeSetting } from '@slonigiraf/db';
import OpenAI from 'openai';

import { openRouterRequestGate } from '../../../../openrouter/concurrency.js';
import { reportOpenRouterCost, type OpenRouterCostReporter } from '../../../../openrouter/cost.js';
import { standardsConceptEmbeddingInput, standardEmbeddingInput, type StandardsCatalog } from './standards.js';

const EMBEDDING_BATCH_SIZE = 100;

function embeddingBatches<T> (values: T[], size = EMBEDDING_BATCH_SIZE): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }

  return batches;
}

function isFiniteEmbedding (embedding: unknown): embedding is number[] {
  return Array.isArray(embedding) && embedding.length > 0 && embedding.every((value) => typeof value === 'number' && Number.isFinite(value));
}

export function conceptEmbeddingInput ({ description, title }: Pick<BookConcept, 'description' | 'title'>): string {
  return standardsConceptEmbeddingInput({ description, title });
}

export async function requestTextEmbeddings (client: OpenAI, embedder: string, inputs: string[], onCost?: OpenRouterCostReporter, signal?: AbortSignal): Promise<number[][]> {
  if (signal?.aborted) {
    throw new DOMException('Processing aborted.', 'AbortError');
  }

  if (!inputs.length) {
    return [];
  }

  const response = await openRouterRequestGate.run(() => client.embeddings.create({
    encoding_format: 'float',
    input: inputs,
    model: embedder
  }, { signal }), { signal });

  reportOpenRouterCost(response, onCost);
  const rows = [...response.data].sort((a, b) => a.index - b.index);

  if (rows.length !== inputs.length || rows.some(({ embedding }) => !isFiniteEmbedding(embedding))) {
    throw new Error(`OpenRouter returned invalid embeddings for ${embedder}.`);
  }

  const dimensions = rows[0]?.embedding.length ?? 0;

  if (!dimensions || rows.some(({ embedding }) => embedding.length !== dimensions)) {
    throw new Error(`OpenRouter returned inconsistent embedding dimensions for ${embedder}.`);
  }

  return rows.map(({ embedding }) => embedding);
}

export async function ensureStandardEmbeddingCache (client: OpenAI, embedder: string, catalogs: StandardsCatalog[], onCost?: OpenRouterCostReporter): Promise<Map<string, number[]>> {
  const standards = Array.from(new Map(catalogs.flatMap(({ standards }) => standards).map((standard) => [standard.code, standard] as const)).values());
  const ids = standards.map(({ code }) => code);
  const configuredEmbedder = await getSetting(SettingKey.STANDARDS_EMBEDDER);
  const embedderChanged = configuredEmbedder !== embedder;
  let embedderRecorded = !embedderChanged;

  const cachedRows = await getStandardEmbeddings(ids);
  const byId = new Map<string, number[]>(cachedRows.flatMap(({ embedding, id, model }) => model === embedder && isFiniteEmbedding(embedding) ? [[id, embedding] as const] : []));
  const missing = standards.filter(({ code }) => !byId.has(code));

  for (const batch of embeddingBatches(missing)) {
    const vectors = await requestTextEmbeddings(client, embedder, batch.map(standardEmbeddingInput), onCost);
    const rows: StandardEmbedding[] = batch.map(({ code }, index) => ({
      embedding: vectors[index],
      id: code,
      model: embedder
    }));

    await putStandardEmbeddings(rows);
    rows.forEach(({ embedding, id }) => byId.set(id, embedding));

    if (!embedderRecorded) {
      await storeSetting(SettingKey.STANDARDS_EMBEDDER, embedder);
      embedderRecorded = true;
    }
  }

  if (!embedderRecorded) {
    await storeSetting(SettingKey.STANDARDS_EMBEDDER, embedder);
  }

  return byId;
}

function storableConcepts (concepts: BookConcept[]): Array<BookConcept & { id: number }> {
  const byId = new Map<number, BookConcept & { id: number }>();

  concepts.forEach((concept) => {
    if (concept.id !== undefined && Number.isSafeInteger(concept.id) && concept.id > 0 && conceptEmbeddingInput(concept)) {
      byId.set(concept.id, concept as BookConcept & { id: number });
    }
  });

  return Array.from(byId.values());
}

export async function cachedConceptEmbeddingMap (embedder: string, concepts: BookConcept[]): Promise<Map<number, number[]>> {
  const current = storableConcepts(concepts);
  const byConcept = new Map(current.map((concept) => [concept.id, concept] as const));
  const rows = await getConceptEmbeddings(current.map(({ id }) => id));

  return new Map<number, number[]>(rows.flatMap(({ embedding, id, input, model }) => {
    const concept = byConcept.get(id);

    return concept && model === embedder && input === conceptEmbeddingInput(concept) && isFiniteEmbedding(embedding)
      ? [[id, embedding] as const]
      : [];
  }));
}

export async function ensureConceptEmbeddingCache (client: OpenAI, embedder: string, concepts: BookConcept[], onCost?: OpenRouterCostReporter): Promise<Map<number, number[]>> {
  const current = storableConcepts(concepts);
  const configuredEmbedder = await getSetting(SettingKey.CONCEPTS_EMBEDDER);
  const embedderChanged = configuredEmbedder !== embedder;
  let embedderRecorded = !embedderChanged;

  const byConcept = new Map(current.map((concept) => [concept.id, concept] as const));
  const cachedRows = await getConceptEmbeddings(current.map(({ id }) => id));
  const byId = new Map<number, number[]>(cachedRows.flatMap(({ embedding, id, input, model }) => {
    const concept = byConcept.get(id);

    return concept && model === embedder && input === conceptEmbeddingInput(concept) && isFiniteEmbedding(embedding)
      ? [[id, embedding] as const]
      : [];
  }));
  const missing = current.filter(({ id }) => !byId.has(id));

  for (const batch of embeddingBatches(missing)) {
    const inputs = batch.map(conceptEmbeddingInput);
    const vectors = await requestTextEmbeddings(client, embedder, inputs, onCost);
    const rows: ConceptEmbedding[] = batch.map((concept, index) => ({
      bookId: concept.bookPage[0],
      embedding: vectors[index],
      id: concept.id,
      input: inputs[index],
      model: embedder
    }));

    await putConceptEmbeddings(rows);
    rows.forEach(({ embedding, id }) => byId.set(id, embedding));

    if (!embedderRecorded) {
      await storeSetting(SettingKey.CONCEPTS_EMBEDDER, embedder);
      embedderRecorded = true;
    }
  }

  if (!embedderRecorded) {
    await storeSetting(SettingKey.CONCEPTS_EMBEDDER, embedder);
  }

  return byId;
}
