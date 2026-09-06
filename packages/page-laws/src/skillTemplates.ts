// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ExerciseTemplate } from '@slonigiraf/db';

export interface GeneratedSkillTemplate {
  h: string;
  i: string;
  q: Array<{ a: string; h: string; i: string; p: string }>;
  t: number;
}

export interface ExerciseTemplateVariation {
  bookSkillId: number;
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

function parseSkillTemplateValue (template: unknown): GeneratedSkillTemplate {
  if (
    !isRecord(template) ||
    !isNonEmptyString(template.h) ||
    typeof template.i !== 'string' ||
    template.t !== 3 ||
    !Array.isArray(template.q) ||
    template.q.length !== 2 ||
    !template.q.every((exercise: unknown) => isRecord(exercise) && isNonEmptyString(exercise.h) && isNonEmptyString(exercise.a) && typeof exercise.p === 'string' && typeof exercise.i === 'string')
  ) {
    throw new Error('Each skill template must have a name and exactly two exercises with nonempty questions and answers.');
  }

  return template as unknown as GeneratedSkillTemplate;
}

export function parseStoredSkillTemplate (content: string): GeneratedSkillTemplate {
  const parsed = parseResponse(content);

  return parseSkillTemplateValue(Array.isArray(parsed) ? parsed[0] : parsed);
}

export function parseGeneratedSkillTemplates (content: string, expectedCount?: number): GeneratedSkillTemplate[] {
  const parsed = parseResponse(content);
  const templates: unknown = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.templates : undefined;

  if (!Array.isArray(templates) || !templates.length) {
    throw new Error('OpenRouter returned no valid skill templates.');
  }

  if (expectedCount !== undefined && templates.length !== expectedCount) {
    throw new Error(`OpenRouter returned ${templates.length} templates for ${expectedCount} concepts.`);
  }

  // Validate the entire response before callers persist any of its templates.
  return templates.map((value: unknown) => {
    const template = parseSkillTemplateValue(value);
    const [first, second] = template.q;

    if (first.h.replace(/\s+/g, ' ').trim() === second.h.replace(/\s+/g, ' ').trim()) {
      throw new Error('The two exercises must have different input parameters, not identical questions.');
    }

    return template;
  });
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
      bookSkillId: original.bookSkillId,
      solution: variation.solution.trim(),
      sourceExerciseTemplateId: original.id,
      text: variation.text.trim()
    };
  });
}

export function createSkillTemplateFromExerciseVariation (bookSkillTitle: string, original: ExerciseTemplate, variation: ExerciseTemplateVariation): GeneratedSkillTemplate {
  if (!bookSkillTitle.trim() || original.bookSkillId !== variation.bookSkillId) {
    throw new Error('Cannot construct a SkillTemplate without its corresponding BookSkill.');
  }

  return {
    h: bookSkillTitle.trim(),
    i: '',
    q: [
      { a: original.solution.trim(), h: original.text.trim(), i: '', p: '' },
      { a: variation.solution.trim(), h: variation.text.trim(), i: '', p: '' }
    ],
    t: 3
  };
}
