// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { assertSupportedLearnerTextMarkup } from '../Generate/book/domain/learnerTextMarkup.js';

export interface GeneratedAbilityExercise {
  a: string;
  h: string;
  i: string;
  iError?: boolean;
  iPrompt?: string;
  p: string;
  pError?: boolean;
  pPrompt?: string;
}

export interface GeneratedAbility {
  h: string;
  i: string;
  q: GeneratedAbilityExercise[];
  t: number;
}

export type AbilityVisualField = 'p' | 'i';

export function withAbilityVisualSource (exercise: GeneratedAbilityExercise, field: AbilityVisualField, value: string): GeneratedAbilityExercise {
  if (exercise[field] === value) {
    return { ...exercise };
  }

  return field === 'p'
    ? { ...exercise, p: value, pError: undefined }
    : { ...exercise, i: value, iError: undefined };
}

export function withAbilityVisualError (exercise: GeneratedAbilityExercise, field: AbilityVisualField, hasError: boolean): GeneratedAbilityExercise {
  return field === 'p'
    ? { ...exercise, pError: hasError }
    : { ...exercise, iError: hasError };
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

export interface AbilityUnresolvedReview {
  errors: string[];
  index: number;
}

export interface AbilityRepairResult {
  duplicatePairs: AbilityDuplicatePair[];
  reviews: AbilityRepairReview[];
  // The model identified a problem but did not produce any persistable correction.
  // Never claim these entries have been fixed.
  unresolvedReviews?: AbilityUnresolvedReview[];
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
  // Keep the hydrated local representation image-complete. The DB layer stores
  // q[].p/q[].i as Image ids; only this ephemeral publish copy swaps hydrated
  // visual data for IPFS CIDs.
  const localAbility: GeneratedAbility = {
    ...ability,
    i: abilityId,
    q: ability.q.map((exercise) => ({ ...exercise }))
  };
  const q = await Promise.all(localAbility.q.map(async (exercise) => {
    const publishedExercise = {
      ...exercise,
      i: await publishImage(exercise.i),
      p: await publishImage(exercise.p)
    };

    delete publishedExercise.iError;
    delete publishedExercise.iPrompt;
    delete publishedExercise.pError;
    delete publishedExercise.pPrompt;

    return publishedExercise;
  }));

  return {
    localAbility,
    publishAbility: { ...localAbility, q }
  };
}

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
  const shapeError = 'Each Ability must have a name and exactly two exercises with nonempty questions and a text answer or solution image.';

  if (
    !isRecord(template) ||
    !isNonEmptyString(template.h) ||
    typeof template.i !== 'string' ||
    template.t !== 3 ||
    !Array.isArray(template.q) ||
    template.q.length !== 2
  ) {
    throw new Error(shapeError);
  }

  const q = template.q.map((exercise: unknown, index: number): GeneratedAbilityExercise => {
    if (!isRecord(exercise) || !isNonEmptyString(exercise.h)) {
      throw new Error(`${shapeError} Exercise ${index + 1} needs a nonempty question (h).`);
    }

    // Images are stored separately. Before TikZ has been generated, a hydrated
    // image-only answer has i="" but a nonempty iPrompt. Do not reject that
    // legitimate intermediate state or it cannot reach the Images stage.
    const hasSolutionVisual = isNonEmptyString(exercise.i) || isNonEmptyString(exercise.iPrompt);
    const hasAnswer = isNonEmptyString(exercise.a);
    const hasEmptyAnswer = exercise.a === null || exercise.a === undefined || (typeof exercise.a === 'string' && !exercise.a.trim());
    const imageOnly = !hasAnswer && hasEmptyAnswer && hasSolutionVisual;

    if (!hasAnswer && !imageOnly) {
      throw new Error(`${shapeError} Exercise ${index + 1} needs a text answer (a) or a solution image prompt (i/iPrompt).`);
    }

    // For a purely visual answer, a model may omit the empty a/p/i fields
    // (provided that iPrompt supplies the solution when i is omitted).
    // Continue requiring the normal complete schema for text answers.
    if ((typeof exercise.p !== 'string' && !(imageOnly && (exercise.p === undefined || exercise.p === null))) ||
      (typeof exercise.i !== 'string' && !(imageOnly && (exercise.i === undefined || exercise.i === null) && isNonEmptyString(exercise.iPrompt))) ||
      (exercise.iPrompt !== undefined && typeof exercise.iPrompt !== 'string') ||
      (exercise.pPrompt !== undefined && typeof exercise.pPrompt !== 'string')) {
      throw new Error(`${shapeError} Exercise ${index + 1} has invalid visual fields.`);
    }

    return {
      a: typeof exercise.a === 'string' ? exercise.a.trim() : '',
      h: exercise.h.trim(),
      i: typeof exercise.i === 'string' ? exercise.i : '',
      ...(typeof exercise.iError === 'boolean' ? { iError: exercise.iError } : {}),
      ...(typeof exercise.iPrompt === 'string' ? { iPrompt: exercise.iPrompt } : {}),
      p: typeof exercise.p === 'string' ? exercise.p : '',
      ...(typeof exercise.pError === 'boolean' ? { pError: exercise.pError } : {}),
      ...(typeof exercise.pPrompt === 'string' ? { pPrompt: exercise.pPrompt } : {})
    };
  });

  return {
    h: template.h.trim(),
    i: template.i,
    q,
    t: 3
  };
}

export function parseStoredAbility (content: string): GeneratedAbility {
  const parsed = parseResponse(content);

  return parseAbilityValue(Array.isArray(parsed) ? parsed[0] : parsed);
}

/** Validate the manual editor without rejecting image-only answer exercises.
 * Like parseStoredAbility, an answer may be represented by a text response,
 * an existing visual, or a prompt for an answer visual still to be generated. */
export function abilityEditValidationError (ability: GeneratedAbility): string | null {
  if (!ability.h.trim()) {
    return 'Ability name is required.';
  }

  for (const [index, exercise] of ability.q.entries()) {
    if (!exercise.h.trim()) {
      return `Exercise ${index + 1} needs a question.`;
    }

    if (!exercise.a.trim() && !exercise.i.trim() && !exercise.iPrompt?.trim()) {
      return `Exercise ${index + 1} needs a text answer or an answer image.`;
    }
  }

  return null;
}


/** Preferred learner-facing limits; visual specifications and copied Concept titles are exempt. */
export const ABILITY_QUESTION_MAX_WORDS = 21;
export const ABILITY_ANSWER_MAX_WORDS = 25;
const ABILITY_QUESTION_MAX_CHARACTERS = 180;
const ABILITY_ANSWER_MAX_CHARACTERS = 200;

function wordCount (value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export interface AbilityBrevityIssue {
  characters: number;
  exerciseIndex: number;
  field: 'h' | 'a';
  maxCharacters: number;
  maxWords: number;
  words: number;
}

/** Identify overlong existing Ability text before asking the AI to repair it. */
export function abilityBrevityIssues (ability: GeneratedAbility): AbilityBrevityIssue[] {
  return ability.q.flatMap((exercise, exerciseIndex) => (['h', 'a'] as const).flatMap((field) => {
    const value = exercise[field];
    const words = wordCount(value);
    const maxWords = field === 'h' ? ABILITY_QUESTION_MAX_WORDS : ABILITY_ANSWER_MAX_WORDS;
    const maxCharacters = field === 'h' ? ABILITY_QUESTION_MAX_CHARACTERS : ABILITY_ANSWER_MAX_CHARACTERS;

    return words > maxWords || value.length > maxCharacters
      ? [{ characters: value.length, exerciseIndex, field, maxCharacters, maxWords, words }]
      : [];
  }));
}

function isSuccinct (value: string, maxWords: number, maxCharacters: number): boolean {
  return value.length <= maxCharacters && wordCount(value) <= maxWords;
}

function isForbiddenAbilityTaskTitle (value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();

  return normalized === 'task 1' || normalized === 'task 2';
}

function hasForbiddenAbilityTaskTitle (ability: GeneratedAbility): boolean {
  return ability.q.some(({ h }) => isForbiddenAbilityTaskTitle(h));
}

export function validateGeneratedAbilityText (ability: GeneratedAbility, validateTitleLength = true, enforceBrevity = true): void {
  // Learner-facing Abilities are intentionally much smaller than source-book
  // exercises. Strict brevity validation requests a model retry, while the
  // tolerant fallback still enforces structure, markup and task titles. Concept titles are sourced
  // verbatim rather than generated, so they must not be shortened here.
  if (validateTitleLength && !isSuccinct(ability.h, 12, 90)) {
    throw new Error('Ability title is too verbose.');
  }

  assertSupportedLearnerTextMarkup(ability.h, 'Ability title');

  for (const [index, exercise] of ability.q.entries()) {
    assertSupportedLearnerTextMarkup(exercise.h, `Ability exercise ${index + 1} question`);
    assertSupportedLearnerTextMarkup(exercise.a, `Ability exercise ${index + 1} answer`);

    if (isForbiddenAbilityTaskTitle(exercise.h)) {
      throw new Error('Ability task titles must be meaningful learner-facing tasks, not the placeholders "Task 1" or "Task 2".');
    }

    if (enforceBrevity && !isSuccinct(exercise.h, ABILITY_QUESTION_MAX_WORDS, ABILITY_QUESTION_MAX_CHARACTERS)) {
      throw new Error(`Ability exercise ${index + 1} question is too verbose (maximum ${ABILITY_QUESTION_MAX_WORDS} words / ${ABILITY_QUESTION_MAX_CHARACTERS} characters). Shorten without dropping essential task data or changing the method.`);
    }

    if (enforceBrevity && !isSuccinct(exercise.a, ABILITY_ANSWER_MAX_WORDS, ABILITY_ANSWER_MAX_CHARACTERS)) {
      throw new Error(`Ability exercise ${index + 1} answer is too verbose (maximum ${ABILITY_ANSWER_MAX_WORDS} words / ${ABILITY_ANSWER_MAX_CHARACTERS} characters). Keep the result and essential reasoning.`);
    }
  }
}

function parseGeneratedAbilityValue (value: unknown, fixedTitle?: string, allowVerboseText = false): GeneratedAbility {
  // Inject the linked source Concept title before schema validation;
  // ignore any title a model might return despite the requested JSON shape.
  const template = parseAbilityValue(fixedTitle !== undefined && isRecord(value) ? { ...value, h: fixedTitle } : value);

  // Both generated titles and titles copied from source Concepts retain their
  // original capitalization. Prompt instructions, not string rewriting, govern it.
  template.h = fixedTitle !== undefined ? fixedTitle : template.h.replace(/\s+/g, ' ').trim();

  // Distinct concrete inputs are a quality requirement, not a schema
  // requirement. Do not make the whole Ability-generation workflow fail just
  // because a model duplicated the two practice questions. The generation and
  // audit prompts still require distinct inputs, and Fix abilities can repair a
  // duplicate pair afterwards. Keeping this parser structural prevents one
  // imperfect pair from discarding every Ability for the source Exercise.
  validateGeneratedAbilityText(template, fixedTitle === undefined, !allowVerboseText);

  return template;
}

export function parseGeneratedAbilities (content: string, expectedCount?: number, options?: { allowIdenticalQuestionText?: boolean; allowVerboseText?: boolean; fixedTitle?: string; visualPromptsOnly?: boolean }): GeneratedAbility[] {
  const parsed = parseResponse(content);
  const templates: unknown = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.abilities ?? parsed.templates : undefined;

  if (!Array.isArray(templates) || !templates.length) {
    throw new Error('OpenRouter returned no valid Abilities.');
  }

  if (expectedCount !== undefined && templates.length !== expectedCount) {
    throw new Error(`OpenRouter returned ${templates.length} Abilities; expected ${expectedCount}.`);
  }

  // New Concept -> Ability generation must never overload p/i with prompt text.
  // Keep the general/stored Ability parser backward-compatible with older rows
  // whose visuals may already contain TikZ source or legacy prompt descriptions.
  return templates.map((template, abilityIndex) => {
    if (options?.visualPromptsOnly) {
      if (!isRecord(template) || !Array.isArray(template.q)) {
        throw new Error(`Ability ${abilityIndex + 1} must contain two exercises.`);
      }

      for (const [exerciseIndex, value] of template.q.entries()) {
        if (!isRecord(value)) {
          throw new Error(`Ability ${abilityIndex + 1}, exercise ${exerciseIndex + 1} must be an object.`);
        }

        if (value.p !== '' || value.i !== '') {
          throw new Error(`Ability ${abilityIndex + 1}, exercise ${exerciseIndex + 1}: p and i are image data fields and must be empty during generation; put image descriptions in pPrompt and iPrompt.`);
        }

        if (typeof value.pPrompt !== 'string' || typeof value.iPrompt !== 'string') {
          throw new Error(`Ability ${abilityIndex + 1}, exercise ${exerciseIndex + 1}: pPrompt and iPrompt are required strings (empty when unused).`);
        }
      }
    }

    return parseGeneratedAbilityValue(template, options?.fixedTitle, options?.allowVerboseText);
  });
}


function abilitySignature (ability: GeneratedAbility): string {
  return JSON.stringify({
    h: ability.h,
    i: ability.i,
    q: ability.q.map(({ a, h, i, iPrompt, p, pPrompt }) => ({ a, h, i, iPrompt, p, pPrompt })),
    t: ability.t
  });
}

export function parseAbilityRepairResult (content: string, originals: Array<GeneratedAbility | null>, originalIds: string[], options: { allowVerboseText?: boolean; collectUnchangedRepairs?: boolean } = {}): AbilityRepairResult {
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
  const unresolvedReviews: AbilityUnresolvedReview[] = [];

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

    // Fix abilities must copy the source Concept title exactly. Rewriting its
    // capitalization could turn a real title-only correction into a no-op.
    const parsedAbility = parseAbilityValue(value.ability);

    validateGeneratedAbilityText(parsedAbility, false, !options.allowVerboseText);
    const mergedAbility = original === null
      ? parsedAbility
      : {
        ...parsedAbility,
        i: original.i,
        // Only learner-facing text is writable in Fix abilities. Copy the
        // existing visual links, prompts, and validation flags as a complete
        // unit so the model cannot add/alter metadata when the original lacked
        // that optional property. Otherwise image-only responses look like
        // valid text fixes despite having no persistable correction.
        q: parsedAbility.q.map(({ a, h }, exerciseIndex) => ({
          ...original.q[exerciseIndex],
          a,
          h
        }))
      };
    // Preserve the model's learner-facing text exactly as returned. Number/KaTeX
    // semantics are handled by the AI review instructions rather than by regex
    // rewriting, which cannot reliably distinguish identifiers from algebra.
    if (original !== null && abilitySignature(mergedAbility) === abilitySignature(original)) {
      if (options.collectUnchangedRepairs) {
        unresolvedReviews.push({ errors, index });

        return;
      }

      throw new Error(`OpenRouter identified an Ability error at index ${index} but did not change any persistable field (title, question, or answer). Image and visual-prompt edits cannot be applied by Fix abilities. Reported problems: ${errors.join('; ')}`);
    }

    reviews.push({ ability: mergedAbility, errors, hasErrors: true, index });
  });

  const reviewedIndexes = new Set([...reviews.filter(({ ability, hasErrors }) => hasErrors && ability).map(({ index }) => index), ...unresolvedReviews.map(({ index }) => index)]);
  const missingRequiredPlaceholderRepairs = originals.flatMap((original, index) => {
    if (!original || !hasForbiddenAbilityTaskTitle(original) || deletedDuplicateIds.has(originalIds[index]) || reviewedIndexes.has(index)) {
      return [];
    }

    return [index];
  });

  if (missingRequiredPlaceholderRepairs.length) {
    throw new Error(`Fix abilities must replace placeholder task titles "Task 1"/"Task 2" for Ability index${missingRequiredPlaceholderRepairs.length === 1 ? '' : 'es'} ${missingRequiredPlaceholderRepairs.join(', ')}.`);
  }

  // Missing indexes are intentional: the repair API may return only Abilities
  // where it found an error. Omitted Abilities are therefore left unchanged.
  return { duplicatePairs, reviews: reviews.sort((a, b) => a.index - b.index), ...(unresolvedReviews.length ? { unresolvedReviews } : {}) };
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

