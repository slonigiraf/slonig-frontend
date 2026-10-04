// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';
import type OpenAI from 'openai';

import type { GeneratedAbility, GeneratedAbilityExercise } from '../../../../abilities/abilities.js';
import type { OpenRouterCostReporter } from '../../../../openrouter/cost.js';

import { stripMarkdownImageReferences } from '../../infrastructure/pdf/bookImageRefs.js';
import { requestTextEmbeddings } from '../../infrastructure/ai/standardsEmbeddings.js';

const EMBEDDING_BATCH_SIZE = 100;

export type AbilityEmbeddingValidationField = 'answer' | 'answerImage' | 'questionImage' | 'title';

export interface AbilityEmbeddingValidationSignal {
  field: AbilityEmbeddingValidationField;
  reason: 'lowSimilarity' | 'missingInAbility' | 'unexpectedInAbility' | 'unavailable';
  similarity?: number;
  taskIndex?: number;
}

export interface AbilityEmbeddingValidationHint {
  model: string;
  needsAdditionalCheck: boolean;
  signals: AbilityEmbeddingValidationSignal[];
}

export interface AbilityEmbeddingValidationRecord {
  ability: GeneratedAbility | null;
  abilityId: string;
  exercise?: Exercise;
}

interface SimilarityPair {
  abilityId: string;
  field: AbilityEmbeddingValidationField;
  left: string;
  right: string;
  taskIndex?: number;
  threshold: number;
}

const FIELD_MIN_SIMILARITY: Record<AbilityEmbeddingValidationField, number> = {
  answer: 0.42,
  answerImage: 0.5,
  questionImage: 0.5,
  title: 0.55
};

function vectorNorm (embedding: number[]): number {
  return Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
}

export function cosineSimilarity (left: number[], right: number[]): number | undefined {
  if (!left.length || left.length !== right.length) {
    return undefined;
  }

  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);

  if (!leftNorm || !rightNorm) {
    return undefined;
  }

  let dot = 0;

  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
  }

  const similarity = dot / (leftNorm * rightNorm);

  return Number.isFinite(similarity) ? Math.max(-1, Math.min(1, similarity)) : undefined;
}

function semanticVisual (exercise: GeneratedAbilityExercise, field: 'p' | 'i'): string {
  const prompt = field === 'p' ? exercise.pPrompt?.trim() : exercise.iPrompt?.trim();

  if (prompt) {
    return prompt;
  }

  const value = exercise[field].trim();

  return /\\begin\s*\{tikzpicture\}/.test(value) ? '' : value;
}

function addVisualSignals (
  abilityId: string,
  field: 'answerImage' | 'questionImage',
  source: string,
  tasks: GeneratedAbilityExercise[],
  pairs: SimilarityPair[],
  signals: AbilityEmbeddingValidationSignal[]
): void {
  const sourceValue = source.trim();
  const abilityField = field === 'questionImage' ? 'p' : 'i';

  tasks.forEach((task, taskIndex) => {
    const abilityValue = semanticVisual(task, abilityField);

    if (!sourceValue && abilityValue) {
      signals.push({ field, reason: 'unexpectedInAbility', taskIndex });
    } else if (sourceValue && !abilityValue) {
      signals.push({ field, reason: 'missingInAbility', taskIndex });
    } else if (sourceValue && abilityValue) {
      pairs.push({
        abilityId,
        field,
        left: `${field === 'questionImage' ? 'Exercise question image specification' : 'Exercise answer image specification'}: ${sourceValue}`,
        right: `${field === 'questionImage' ? 'Ability question image specification' : 'Ability answer image specification'}: ${abilityValue}`,
        taskIndex,
        threshold: FIELD_MIN_SIMILARITY[field]
      });
    }
  });
}

function collectValidationWork (records: AbilityEmbeddingValidationRecord[]): { pairs: SimilarityPair[]; signalsByAbilityId: Map<string, AbilityEmbeddingValidationSignal[]> } {
  const pairs: SimilarityPair[] = [];
  const signalsByAbilityId = new Map<string, AbilityEmbeddingValidationSignal[]>();

  records.forEach(({ ability, abilityId, exercise }) => {
    const signals: AbilityEmbeddingValidationSignal[] = [];

    signalsByAbilityId.set(abilityId, signals);

    if (!ability || !exercise) {
      signals.push({ field: 'title', reason: 'unavailable' });

      return;
    }

    ability.q.forEach((task, taskIndex) => {
      pairs.push({
        abilityId,
        field: 'title',
        left: `Exercise title: ${exercise.title}\nExercise task: ${stripMarkdownImageReferences(exercise.description)}`,
        right: `Ability title: ${ability.h}\nAbility task: ${task.h}`,
        taskIndex,
        threshold: FIELD_MIN_SIMILARITY.title
      });
      pairs.push({
        abilityId,
        field: 'answer',
        left: `Exercise title: ${exercise.title}\nExercise answer: ${exercise.solution}`,
        right: `Ability title: ${ability.h}\nAbility answer: ${task.a}`,
        taskIndex,
        threshold: FIELD_MIN_SIMILARITY.answer
      });
    });

    addVisualSignals(abilityId, 'questionImage', exercise.imageDescription ?? '', ability.q, pairs, signals);
    addVisualSignals(abilityId, 'answerImage', exercise.solutionImageDescription ?? '', ability.q, pairs, signals);
  });

  return { pairs, signalsByAbilityId };
}

function batches<T> (values: T[], size = EMBEDDING_BATCH_SIZE): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

export async function buildAbilityEmbeddingValidationHints (
  client: OpenAI,
  model: string,
  records: AbilityEmbeddingValidationRecord[],
  onCost?: OpenRouterCostReporter,
  signal?: AbortSignal
): Promise<Map<string, AbilityEmbeddingValidationHint>> {
  const { pairs, signalsByAbilityId } = collectValidationWork(records);
  const inputs = Array.from(new Set(pairs.flatMap(({ left, right }) => [left, right])));
  const embeddingByInput = new Map<string, number[]>();

  for (const batch of batches(inputs)) {
    const embeddings = await requestTextEmbeddings(client, model, batch, onCost, signal);

    batch.forEach((input, index) => embeddingByInput.set(input, embeddings[index]));
  }

  pairs.forEach(({ abilityId, field, left, right, taskIndex, threshold }) => {
    const leftEmbedding = embeddingByInput.get(left);
    const rightEmbedding = embeddingByInput.get(right);
    const similarity = leftEmbedding && rightEmbedding ? cosineSimilarity(leftEmbedding, rightEmbedding) : undefined;
    const signals = signalsByAbilityId.get(abilityId) ?? [];

    if (similarity === undefined) {
      signals.push({ field, reason: 'unavailable', ...(taskIndex === undefined ? {} : { taskIndex }) });
    } else if (similarity < threshold) {
      signals.push({ field, reason: 'lowSimilarity', similarity: Number(similarity.toFixed(3)), ...(taskIndex === undefined ? {} : { taskIndex }) });
    }

    signalsByAbilityId.set(abilityId, signals);
  });

  return new Map(records.map(({ abilityId }) => {
    const signals = signalsByAbilityId.get(abilityId) ?? [];

    return [abilityId, { model, needsAdditionalCheck: signals.length > 0, signals }] as const;
  }));
}
