// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ExerciseTemplate } from '@slonigiraf/db';

export interface GeneratedAbility {
  h: string;
  i: string;
  q: Array<{ a: string; h: string; i: string; p: string }>;
  t: number;
}

export interface AbilityExerciseImagePrompts {
  changesImage: boolean;
  i: string;
  p: string;
}

export interface GeneratedExerciseAbility {
  ability: GeneratedAbility;
  exerciseId: number;
  imagePrompts?: [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];
}

export interface AbilityRepairReview {
  ability?: GeneratedAbility;
  errors: string[];
  hasErrors: boolean;
  index: number;
}

export interface AbilityDuplicatePair {
  deletedAbilityId: string;
  keptAbilityId: string;
}

export interface AbilityRepairResult {
  duplicatePairs: AbilityDuplicatePair[];
  reviews: AbilityRepairReview[];
}

export interface PreparedAbilityForPublishing {
  localAbility: GeneratedAbility;
  publishAbility: GeneratedAbility;
}

export async function prepareAbilityForPublishing (
  ability: GeneratedAbility,
  abilityId: string,
  publishImage: (value: string) => Promise<string>
): Promise<PreparedAbilityForPublishing> {
  // Keep the locally stored representation image-complete. Only the ephemeral
  // publish copy replaces local image data with IPFS CIDs.
  const localAbility: GeneratedAbility = {
    ...ability,
    i: abilityId,
    q: ability.q.map((exercise) => ({ ...exercise }))
  };
  const q = await Promise.all(localAbility.q.map(async (exercise) => ({
    ...exercise,
    i: await publishImage(exercise.i),
    p: await publishImage(exercise.p)
  })));

  return {
    localAbility,
    publishAbility: { ...localAbility, q }
  };
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

  return {
    h: template.h.trim(),
    i: template.i,
    q: template.q.map((exercise) => {
      const value = exercise as Record<string, unknown>;

      return { a: String(value.a).trim(), h: String(value.h).trim(), i: String(value.i), p: String(value.p) };
    }),
    t: 3
  };
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


function abilitySignature (ability: GeneratedAbility): string {
  return JSON.stringify({
    h: ability.h,
    i: ability.i,
    q: ability.q.map(({ a, h, i, p }) => ({ a, h, i, p })),
    t: ability.t
  });
}

export function parseAbilityRepairResult (content: string, originals: Array<GeneratedAbility | null>, originalIds: string[]): AbilityRepairResult {
  if (originalIds.length !== originals.length || new Set(originalIds).size !== originalIds.length) {
    throw new Error('Ability repair input IDs do not match the supplied Abilities.');
  }

  const parsed = parseResponse(content);

  if (!isRecord(parsed) || !Array.isArray(parsed.reviews) || !Array.isArray(parsed.duplicatePairs)) {
    throw new Error('OpenRouter returned invalid Ability repair data.');
  }

  const values: unknown[] = parsed.reviews;
  const allowedIds = new Set(originalIds);
  const indexesById = new Map(originalIds.map((id, index) => [id, index] as const));
  const duplicatePairs: AbilityDuplicatePair[] = [];
  const deletedDuplicateIds = new Set<string>();
  const keptDuplicateIds = new Set<string>();

  parsed.duplicatePairs.forEach((value: unknown): void => {
    if (
      !isRecord(value) ||
      typeof value.keptAbilityId !== 'string' ||
      !value.keptAbilityId.trim() ||
      typeof value.deletedAbilityId !== 'string' ||
      !value.deletedAbilityId.trim() ||
      value.keptAbilityId === value.deletedAbilityId ||
      !allowedIds.has(value.keptAbilityId) ||
      !allowedIds.has(value.deletedAbilityId) ||
      deletedDuplicateIds.has(value.deletedAbilityId)
    ) {
      throw new Error('OpenRouter returned an invalid duplicate Ability pair.');
    }

    const keptIndex = indexesById.get(value.keptAbilityId);
    const deletedIndex = indexesById.get(value.deletedAbilityId);

    if (keptIndex === undefined || deletedIndex === undefined || keptIndex >= deletedIndex) {
      throw new Error('OpenRouter must keep the earliest supplied duplicate Ability.');
    }

    keptDuplicateIds.add(value.keptAbilityId);
    deletedDuplicateIds.add(value.deletedAbilityId);
    duplicatePairs.push({ deletedAbilityId: value.deletedAbilityId, keptAbilityId: value.keptAbilityId });
  });

  if (Array.from(keptDuplicateIds).some((id) => deletedDuplicateIds.has(id))) {
    throw new Error('OpenRouter returned contradictory duplicate Ability pairs.');
  }

  const used = new Set<number>();
  const reviews: AbilityRepairReview[] = [];

  values.forEach((value: unknown): void => {
    // Models occasionally append an extra review outside the requested batch.
    // Ignore those extras: only indexes from this batch are allowed to affect the DB.
    if (
      isRecord(value) &&
      typeof value.index === 'number' &&
      Number.isSafeInteger(value.index) &&
      (value.index < 0 || value.index >= originals.length)
    ) {
      return;
    }

    if (
      !isRecord(value) ||
      typeof value.index !== 'number' ||
      !Number.isSafeInteger(value.index) ||
      used.has(value.index) ||
      typeof value.hasErrors !== 'boolean' ||
      !Array.isArray(value.errors) ||
      !value.errors.every((error: unknown) => isNonEmptyString(error))
    ) {
      throw new Error('OpenRouter returned an invalid or duplicate Ability review.');
    }

    const index = value.index;
    const original = originals[index];
    const errors = value.errors.map((error) => String(error).trim());

    used.add(index);

    if (!value.hasErrors) {
      if (errors.length || original === null) {
        throw new Error('OpenRouter marked an invalid Ability as error-free or returned contradictory review details.');
      }

      reviews.push({ errors: [], hasErrors: false, index });

      return;
    }

    if (!errors.length) {
      throw new Error('Every erroneous Ability review must identify at least one error.');
    }

    const parsedAbility = parseGeneratedAbilityValue(value.ability);
    const ability = original === null
      ? parsedAbility
      : {
        ...parsedAbility,
        i: original.i,
        q: parsedAbility.q.map((exercise, exerciseIndex) => ({
          ...exercise,
          i: original.q[exerciseIndex].i,
          p: original.q[exerciseIndex].p
        }))
      };

    if (original !== null && abilitySignature(ability) === abilitySignature(original)) {
      throw new Error('OpenRouter identified an Ability error but did not change the Ability.');
    }

    reviews.push({ ability, errors, hasErrors: true, index });
  });

  // Missing indexes are intentional: the repair API may return only Abilities
  // where it found an error. Omitted Abilities are therefore left unchanged.
  return { duplicatePairs, reviews: reviews.sort((a, b) => a.index - b.index) };
}

export function parseAbilityRepairReviews (content: string, originals: Array<GeneratedAbility | null>): AbilityRepairReview[] {
  const parsed = parseResponse(content);
  const normalized = Array.isArray(parsed)
    ? { duplicatePairs: [], reviews: parsed }
    : isRecord(parsed) && !Array.isArray(parsed.duplicatePairs)
      ? { ...parsed, duplicatePairs: [] }
      : parsed;

  return parseAbilityRepairResult(JSON.stringify(normalized), originals, originals.map((_, index) => String(index))).reviews;
}

function firstString (record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeExerciseConversionAbility (value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const rawQuestions = Array.isArray(value.q)
    ? value.q
    : Array.isArray(value.questions)
      ? value.questions
      : Array.isArray(value.exercises)
        ? value.exercises
        : undefined;

  if (!rawQuestions) {
    return value;
  }

  const normalizedQuestions = rawQuestions.flatMap((question): Array<{ a: string; h: string; i: string; p: string }> => {
    if (!isRecord(question)) {
      return [];
    }

    const h = firstString(question, ['h', 'question', 'prompt', 'text']);
    const a = firstString(question, ['a', 'answer', 'solution', 'response']);

    return h && a ? [{ a, h, i: '', p: '' }] : [];
  });

  if (normalizedQuestions.length < 2) {
    return value;
  }

  const first = normalizedQuestions[0];
  const second = normalizedQuestions.slice(1).find(({ h }) => h.replace(/\s+/g, ' ').trim() !== first.h.replace(/\s+/g, ' ').trim()) ?? normalizedQuestions[1];
  const h = firstString(value, ['h', 'title', 'name', 'skill', 'ability']);

  return {
    h: h ?? value.h,
    i: typeof value.i === 'string' ? value.i : '',
    q: [first, second],
    t: 3
  };
}

function parseAbilityImagePrompts (value: unknown): [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts] | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }

  const prompts = value.map((item): AbilityExerciseImagePrompts | undefined => {
    if (!isRecord(item)) {
      return undefined;
    }

    const p = typeof item.p === 'string' ? item.p : typeof item.prompt === 'string' ? item.prompt : typeof item.question === 'string' ? item.question : '';
    const i = typeof item.i === 'string' ? item.i : typeof item.answer === 'string' ? item.answer : typeof item.solution === 'string' ? item.solution : '';
    const changesImage = typeof item.changesImage === 'boolean'
      ? item.changesImage
      : typeof item.modifiesImage === 'boolean'
        ? item.modifiesImage
        : typeof item.editsImage === 'boolean'
          ? item.editsImage
          : undefined;

    if (changesImage === undefined) {
      return undefined;
    }

    return { changesImage, i: i.trim(), p: p.trim() };
  });

  return prompts.every((prompt): prompt is AbilityExerciseImagePrompts => prompt !== undefined)
    ? prompts as [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts]
    : undefined;
}

export function parseGeneratedExerciseAbilities (content: string, expectedExerciseIds: number[], requireImagePrompts = false): GeneratedExerciseAbility[] {
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
    let imagePrompts: [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts] | undefined;
    const isWrappedConversion = isRecord(value) && ('ability' in value || 'exerciseId' in value || 'sourceExerciseId' in value);

    if (requireImagePrompts && !isWrappedConversion) {
      return;
    }

    if (isWrappedConversion) {
      const candidateId = value.exerciseId ?? value.sourceExerciseId;

      if (typeof candidateId !== 'number' || !Number.isSafeInteger(candidateId)) {
        return;
      }

      exerciseId = candidateId;
      imagePrompts = parseAbilityImagePrompts(value.imagePrompts);

      // Exercise-to-Ability generation uses imagePrompts as a required visual
      // decision record. Requiring it means the AI must explicitly decide for
      // every question whether the learner is being asked to change a visual;
      // otherwise the conversion is retried instead of silently losing a
      // required worked-solution image.
      if (!imagePrompts) {
        return;
      }

      abilityValue = value.ability ?? { h: value.h, i: value.i, q: value.q, t: value.t };
    }

    if (exerciseId === undefined || !expected.has(exerciseId) || used.has(exerciseId)) {
      return;
    }

    try {
      const ability = parseGeneratedAbilityValue(normalizeExerciseConversionAbility(abilityValue));

      used.add(exerciseId);
      results.push({ ability, exerciseId, ...(imagePrompts ? { imagePrompts } : {}) });
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
