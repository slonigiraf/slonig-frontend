// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ExerciseTemplate } from '@slonigiraf/db';

export interface GeneratedAbility {
  h: string;
  i: string;
  q: Array<{ a: string; h: string; i: string; p: string }>;
  t: number;
}

export interface GeneratedExerciseAbility {
  ability: GeneratedAbility;
  exerciseId: number;
}

export interface ExerciseTemplateVariation {
  skillId: number;
  solution: string;
  sourceExerciseTemplateId: number;
  text: string;
}

type StoredExerciseTemplate = ExerciseTemplate & { id: number };

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString (value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    // Some models leave LaTeX backslashes unescaped in an otherwise valid response.
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

function parseAbilityValue (template: unknown): GeneratedAbility {
  if (
    !isRecord(template) ||
    !isNonEmptyString(template.h) ||
    typeof template.i !== 'string' ||
    template.t !== 3 ||
    !Array.isArray(template.q) ||
    template.q.length !== 2 ||
    !template.q.every((exercise: unknown) => isRecord(exercise) && isNonEmptyString(exercise.h) && isNonEmptyString(exercise.a) && typeof exercise.p === 'string' && typeof exercise.i === 'string')
  ) {
    throw new Error('Each Ability must have a name and exactly two exercises with nonempty questions and answers.');
  }

  return template as unknown as GeneratedAbility;
}

export function parseStoredAbility (content: string): GeneratedAbility {
  const parsed = parseResponse(content);

  return parseAbilityValue(Array.isArray(parsed) ? parsed[0] : parsed);
}

function parseGeneratedAbilityValue (value: unknown): GeneratedAbility {
  const template = parseAbilityValue(value);
  const [first, second] = template.q;

  if (first.h.replace(/\s+/g, ' ').trim() === second.h.replace(/\s+/g, ' ').trim()) {
    throw new Error('The two exercises must have different input parameters, not identical questions.');
  }

  return template;
}

export function parseGeneratedAbilities (content: string, expectedCount?: number): GeneratedAbility[] {
  const parsed = parseResponse(content);
  const templates: unknown = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.abilities ?? parsed.templates : undefined;

  if (!Array.isArray(templates) || !templates.length) {
    throw new Error('OpenRouter returned no valid Abilities.');
  }

  if (expectedCount !== undefined && templates.length !== expectedCount) {
    throw new Error(`OpenRouter returned ${templates.length} Abilities; expected ${expectedCount}.`);
  }

  // Validate the entire response before callers persist any of its templates.
  return templates.map(parseGeneratedAbilityValue);
}

export function parseGeneratedExerciseAbilities (content: string, expectedExerciseIds: number[]): GeneratedExerciseAbility[] {
  const parsed = parseResponse(content);
  const values: unknown = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? parsed.abilities ?? parsed.conversions ?? parsed.templates
      : undefined;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid Exercise-to-Ability conversion data.');
  }

  const expected = new Set(expectedExerciseIds);
  const used = new Set<number>();
  const results: GeneratedExerciseAbility[] = [];

  values.forEach((value: unknown, index): void => {
    let abilityValue = value;
    let exerciseId = expectedExerciseIds[index];

    if (isRecord(value) && ('ability' in value || 'exerciseId' in value || 'sourceExerciseId' in value)) {
      const candidateId = value.exerciseId ?? value.sourceExerciseId;

      if (typeof candidateId !== 'number' || !Number.isSafeInteger(candidateId)) {
        return;
      }

      exerciseId = candidateId;
      abilityValue = value.ability ?? { h: value.h, i: value.i, q: value.q, t: value.t };
    }

    if (exerciseId === undefined || !expected.has(exerciseId) || used.has(exerciseId)) {
      return;
    }

    try {
      const ability = parseGeneratedAbilityValue(abilityValue);

      used.add(exerciseId);
      results.push({ ability, exerciseId });
    } catch {
      // Keep valid conversions from a partial response and retry this Exercise later.
    }
  });

  return results;
}

export function parseExerciseTemplateVariations (content: string, originals: StoredExerciseTemplate[]): ExerciseTemplateVariation[] {
  const parsed = parseResponse(content);
  const variations = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? parsed.variations ?? parsed.exerciseTemplates ?? parsed.templates
      : undefined;

  if (!Array.isArray(variations) || variations.length !== originals.length) {
    throw new Error(`OpenRouter returned ${Array.isArray(variations) ? variations.length : 0} variations for ${originals.length} ExerciseTemplates.`);
  }

  return variations.map((variation: unknown, index): ExerciseTemplateVariation => {
    const original = originals[index];

    if (
      !isRecord(variation) ||
      !isNonEmptyString(variation.text) ||
      !isNonEmptyString(variation.solution) ||
      variation.text.replace(/\s+/g, ' ').trim() === original.text.replace(/\s+/g, ' ').trim()
    ) {
      throw new Error('OpenRouter returned an invalid or incorrectly paired ExerciseTemplate variation.');
    }

    return {
      skillId: original.skillId,
      solution: variation.solution.trim(),
      sourceExerciseTemplateId: original.id,
      text: variation.text.trim()
    };
  });
}

export function createAbilityFromExerciseVariation (skillTitle: string, original: ExerciseTemplate, variation: ExerciseTemplateVariation): GeneratedAbility {
  if (!skillTitle.trim() || original.skillId !== variation.skillId) {
    throw new Error('Cannot construct an Ability without its corresponding Skill.');
  }

  return {
    h: skillTitle.trim(),
    i: '',
    q: [
      { a: original.solution.trim(), h: original.text.trim(), i: '', p: '' },
      { a: variation.solution.trim(), h: variation.text.trim(), i: '', p: '' }
    ],
    t: 3
  };
}
