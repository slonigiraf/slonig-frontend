// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise, Skill } from '@slonigiraf/db';
import type { AbilityRepairResult, GeneratedAbility } from '../../../../abilities/abilities.js';
import type { TikzPreRenderResult } from '../../../../Edit/TikzDisplay.js';
import type { AbilityEmbeddingValidationHint } from './abilityEmbeddingValidation.js';
import type { ExerciseAbilityConversion } from '../../domain/abilities/abilityWorkflow.js';
import type { OpenRouterCostReporter } from '../../../../openrouter/cost.js';

import OpenAI from 'openai';

import { stripMarkdownImageReferences } from '../../infrastructure/pdf/bookImageRefs.js';
import { transportCompactAbilitySourceExercise } from '../../domain/abilities/abilityWorkflow.js';
import { FIX_ABILITIES_REQUEST_PROMPT, JSON_VALIDATION_PROMPT } from '../../infrastructure/ai/prompts/abilities.js';
import { parseAbilityRepairResult } from '../../../../abilities/abilities.js';
import { LEARNER_AGE_PROMPT, MATH_DISPLAY_REQUIREMENTS_PROMPT } from '../../infrastructure/ai/prompts/shared.js';
import { openRouterRequestGate } from '../../../../openrouter/concurrency.js';
import { reportOpenRouterCost } from '../../../../openrouter/cost.js';

const AI_REQUEST_TIMEOUT_MS = 60_000;
const MAX_VALIDATED_JSON_OUTPUT_TOKENS = 8_000;
const MAX_CHAT_TRUNCATION_RETRY_OUTPUT_TOKENS = 8_000;

class AiResponseTruncatedError extends Error {
  constructor () {
    super('OpenRouter response was truncated before completion.');
    this.name = 'AiResponseTruncatedError';
  }
}

export interface StoredAbility {
  ability: GeneratedAbility | null;
  content: string;
  displayOrder?: number;
  id: string;
  moduleId: string;
}

export interface ImageFixTarget {
  ability: GeneratedAbility;
  exerciseIndex: number;
  imageId: number;
  field: 'p' | 'i';
  originalTikz: string;
  prompt: string;
  record: StoredAbility;
}

export interface TikzAiReview {
  errors: string[];
  hasErrors: boolean;
  tikz: string;
}

export const abilityModuleId = (bookId: number, skillId: number): string => `book-${bookId}-skill-${skillId}`;
export const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;
export const conceptAbilityModuleId = (bookId: number, conceptId: number): string => `book-${bookId}-concept-${conceptId}`;

function parseJson (content: string): unknown {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

export async function requestChatContent (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, jsonObject: boolean, onCost?: OpenRouterCostReporter, maxOutputTokens?: number, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException('Processing aborted.', 'AbortError');
  }

  const makeRequest = () => client.chat.completions.create({
    messages: [{ content: systemPrompt, role: 'system' as const }, { content: userPrompt, role: 'user' as const }],
    model,
    ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
    ...(jsonObject ? { response_format: { type: 'json_object' as const } } : {})
  }, { signal, timeout: AI_REQUEST_TIMEOUT_MS });
  const response = await openRouterRequestGate.run(makeRequest, { signal });

  reportOpenRouterCost(response, onCost);

  const choice = response.choices[0];
  const content = choice?.message?.content?.trim() ?? '';

  if (choice?.finish_reason === 'length') {
    throw new AiResponseTruncatedError();
  }

  if (!content) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return content;
}

export async function requestChatContentWithTruncationRetry (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, jsonObject: boolean, onCost?: OpenRouterCostReporter, maxOutputTokens?: number, signal?: AbortSignal, maxRetryOutputTokens = MAX_CHAT_TRUNCATION_RETRY_OUTPUT_TOKENS): Promise<string> {
  let outputTokenBudget = maxOutputTokens;

  while (true) {
    try {
      return await requestChatContent(client, model, systemPrompt, userPrompt, jsonObject, onCost, outputTokenBudget, signal);
    } catch (error) {
      if (!(error instanceof AiResponseTruncatedError) || outputTokenBudget === undefined || outputTokenBudget >= maxRetryOutputTokens) {
        throw error;
      }

      outputTokenBudget = Math.min(maxRetryOutputTokens, Math.max(outputTokenBudget + 2_000, Math.ceil(outputTokenBudget * 1.5)));
    }
  }
}

export function parseGeneratedSkills (content: string, expectedCount: number): Array<{ description: string; title: string }> {
  const parsed = parseJson(content);
  const values = Array.isArray(parsed) ? parsed : (parsed as { skills?: unknown })?.skills;

  if (!Array.isArray(values)) {
    throw new Error('OpenRouter returned invalid book skill data.');
  }

  const skills = values as Array<Partial<Skill>>;

  if (skills.length !== expectedCount || skills.some(({ description, title }) => typeof title !== 'string' || !title.trim() || typeof description !== 'string')) {
    throw new Error(`OpenRouter returned ${skills.length} skills for ${expectedCount} source items.`);
  }

  return skills.map(({ description = '', title = '' }) => ({ description: description.trim(), title: title.trim() }));
}

function transportExercises (exercises: Exercise[]): unknown[] {
  return exercises.map(({ description, ...exercise }) => ({ ...exercise, description: stripMarkdownImageReferences(description) }));
}

export function abilityRepairInput (
  language: string,
  batch: StoredAbility[],
  chapterTitle?: string,
  learnerAge?: number,
  embeddingHints?: ReadonlyMap<string, AbilityEmbeddingValidationHint>,
  sourceExercisesByModuleId?: ReadonlyMap<string, Exercise>,
  sourceConceptsById?: ReadonlyMap<number, { description: string; title: string }>
): unknown {
  return {
    abilities: batch.map(({ ability, content, id, moduleId }, index) => {
      const embeddingValidation = embeddingHints?.get(id);
      const sourceExercise = sourceExercisesByModuleId?.get(moduleId);
      // Direct Concept -> Ability records have no source Exercise. Resolve the
      // authoritative Concept from the module key; keep Exercise evidence only
      // for genuine older Exercise-linked records.
      const conceptLink = /-concept-(\d+)$/.exec(moduleId);
      const conceptId = conceptLink ? Number(conceptLink[1]) : sourceExercise?.conceptId;
      const sourceConcept = conceptId === undefined ? undefined : sourceConceptsById?.get(conceptId);
      const legacySourceExercise = conceptLink ? undefined : sourceExercise;

      return {
        ability: ability
          ? {
            ...ability,
            q: ability.q.map(({ a, h, i, iPrompt, p, pPrompt }) => ({
              a,
              h,
              i,
              p,
              ...(pPrompt !== undefined ? { pPrompt } : {}),
              ...(iPrompt !== undefined ? { iPrompt } : {})
            }))
          }
          : content,
        ...(embeddingValidation ? { embeddingValidation } : {}),
        id,
        index,
        ...(legacySourceExercise ? { sourceExercise: transportCompactAbilitySourceExercise(legacySourceExercise) } : {}),
        ...(sourceConcept ? { sourceConcept: { title: sourceConcept.title, description: sourceConcept.description } } : {})
      };
    }),
    bookLanguage: language,
    ...(learnerAge === undefined ? {} : { learnerAge }),
    ...(chapterTitle ? { chapterTitle } : {})
  };
}

/**
 * Review a whole chapter so duplicates can be found, then retry only the
 * specific Abilities for which the model diagnosed errors but supplied no
 * persistable correction. A stubborn no-op does not discard valid chapter
 * fixes or silently count as repaired: it is reported to the caller.
 */
export async function requestAbilityRepairResult (
  client: OpenAI,
  model: string,
  systemPrompt: string,
  input: unknown,
  batch: StoredAbility[],
  onCost?: OpenRouterCostReporter,
  signal?: AbortSignal
): Promise<AbilityRepairResult> {
  const originals = batch.map(({ ability }) => ability);
  const ids = batch.map(({ id }) => id);
  const initial = await requestValidatedJson(
    client, model, systemPrompt, FIX_ABILITIES_REQUEST_PROMPT(input),
    (content) => parseAbilityRepairResult(content, originals, ids, { collectUnchangedRepairs: true }),
    true, onCost, undefined, undefined, 2, signal
  );
  const unresolved = initial.unresolvedReviews ?? [];

  if (!unresolved.length) {
    return initial;
  }

  const inputRecords = (input as { abilities: Array<Record<string, unknown>> }).abilities;
  const retryBatch = unresolved.map(({ index }) => batch[index]);
  const retryInput = {
    ...(input as Record<string, unknown>),
    abilities: unresolved.map(({ index }, newIndex) => ({ ...inputRecords[index], index: newIndex }))
  };
  const retryPrompt = `Your previous Fix abilities review identified the following concrete errors but failed to make an effective, persistable correction:
${JSON.stringify(unresolved)}

REPAIR TASK, NOT ANOTHER AUDIT: Return hasErrors:true and a COMPLETE corrected Ability for EVERY supplied input index. Fix the specific listed errors in h, q[].h, or q[].a. Root i and existing image fields q[].p, q[].i, q[].pPrompt, and q[].iPrompt are read-only, so editing only those fields is NOT a correction. Keep the target concept, difficulty, mathematical structure, and essential spatial relationships. Return only JSON with reviews and an empty duplicatePairs array; duplicate detection already ran.

${FIX_ABILITIES_REQUEST_PROMPT(retryInput)}`;

  try {
    const fixed = await requestValidatedJson(
      client, model, systemPrompt, retryPrompt,
      (content) => {
        const parsed = parseAbilityRepairResult(content, retryBatch.map(({ ability }) => ability), retryBatch.map(({ id }) => id));

        if (parsed.duplicatePairs.length || parsed.reviews.length !== retryBatch.length || parsed.reviews.some(({ ability, hasErrors }) => !hasErrors || !ability)) {
          throw new Error('Targeted Ability retry must correct every supplied record without proposing new duplicate deletions.');
        }

        return parsed;
      },
      true, onCost, Math.min(8_000, Math.max(2_400, retryBatch.length * 900)), undefined, 2, signal
    );
    return {
      duplicatePairs: initial.duplicatePairs,
      reviews: [
        ...initial.reviews,
        ...fixed.reviews.map((review) => ({ ...review, index: unresolved[review.index].index }))
      ].sort((a, b) => a.index - b.index)
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }

    return initial;
  }
}

export function exerciseRepairInput (language: string, batch: Exercise[], chapterTitle?: string, learnerAge?: number, sourceConceptsById?: ReadonlyMap<number, { description: string; title: string }>): unknown {
  return {
    bookLanguage: language,
    ...(learnerAge === undefined ? {} : { learnerAge }),
    exercises: batch.map(({ conceptId, description, id, imageDescription = '', solution = '', solutionImageDescription = '', title }, index) => ({
      conceptId,
      ...(conceptId !== undefined && sourceConceptsById?.has(conceptId) ? { sourceConcept: sourceConceptsById.get(conceptId) } : {}),
      exercise: { description: stripMarkdownImageReferences(description), imageDescription, solution, solutionImageDescription, title },
      id,
      index
    })),
    ...(chapterTitle ? { chapterTitle } : {})
  };
}

export function exerciseForPageReplacement ({ conceptId, description, displayOrder, imageDescription, solution, solutionImageDescription, source, title }: Exercise): Omit<Exercise, 'bookPage' | 'id'> {
  return {
    conceptId,
    displayOrder,
    description: stripMarkdownImageReferences(description),
    imageDescription,
    solution,
    solutionImageDescription,
    source,
    title
  };
}

export function storedAbilityImageId (record: StoredAbility, exerciseIndex: number, field: 'p' | 'i'): number | undefined {
  try {
    const parsed = JSON.parse(record.content) as unknown;
    const root = Array.isArray(parsed) ? parsed[0] : parsed;

    if (!root || typeof root !== 'object') {
      return undefined;
    }

    const exercises = (root as { q?: unknown }).q;

    if (!Array.isArray(exercises) || !exercises[exerciseIndex] || typeof exercises[exerciseIndex] !== 'object') {
      return undefined;
    }

    const id = (exercises[exerciseIndex] as Record<string, unknown>)[field];

    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export function abilityWithImageDescriptions (conversion: ExerciseAbilityConversion): GeneratedAbility {
  const q = conversion.ability.q.map((exercise, index) => {
    const prompts = conversion.imagePrompts?.[index];

    return {
      ...exercise,
      // Ability stages start with semantic image descriptions. storeAbility
      // normalizes each description into an Image row referenced by q[].p/q[].i.
      i: prompts?.i ?? '',
      p: prompts?.p ?? ''
    };
  });

  return { ...conversion.ability, q };
}

export function cleanTikzResponse (content: string): string {
  const cleaned = content.trim().replace(/^```(?:latex|tex|tikz)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.search(/\\begin\s*\{tikzpicture\}/);
  const endMatch = /\\end\s*\{tikzpicture\}/g;
  let end = -1;
  let match: RegExpExecArray | null;

  while ((match = endMatch.exec(cleaned)) !== null) {
    end = match.index + match[0].length;
  }

  if (start < 0 || end <= start) {
    throw new Error('OpenRouter returned invalid TikZ code.');
  }

  return cleaned.slice(start, end).trim();
}

export function tikzRequestPrompt (language: string, ability: GeneratedAbility, exerciseIndex: number, field: 'p' | 'i', visualPrompt: string, learnerAge?: number): string {
  const exercise = ability.q[exerciseIndex];
  const purpose = field === 'p' ? 'question visual' : 'answer visual';

  return `Convert the supplied semantic visual description into a compact TikZ diagram for a learner-facing ${purpose}.

Rules:
${MATH_DISPLAY_REQUIREMENTS_PROMPT}
- Return ONLY one \\begin{tikzpicture}...\\end{tikzpicture} block. No markdown fences, prose, documentclass, packages, or external files.
- Use only standard TikZ constructs and common built-in libraries where possible. Keep the drawing browser-renderable by TikZ Editor using standard supported TikZ constructs.
- Preserve the exact mathematical/semantic information in the visual description. Do not add hints or facts that would reveal an answer in a question visual.
- Keep labels concise and in the book language (${language}).
- Prefer a clean educational diagram with sensible coordinates and readable labels.
- Do not embed raster images, URLs, SVG, HTML, or base64 data.
- ${LEARNER_AGE_PROMPT(learnerAge) || 'No learner age is available; do not make age-specific assumptions beyond the supplied educational content.'}

Ability: ${ability.h}
Question: ${exercise.h}
Answer: ${exercise.a}
Visual description: ${visualPrompt}`;
}

export function parseTikzAiReview (content: string): TikzAiReview {
  const parsed = parseJson(content);

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as { hasErrors?: unknown }).hasErrors !== 'boolean' ||
    !Array.isArray((parsed as { errors?: unknown }).errors) ||
    !(parsed as { errors: unknown[] }).errors.every((error) => typeof error === 'string' && error.trim()) ||
    typeof (parsed as { tikz?: unknown }).tikz !== 'string'
  ) {
    throw new Error('OpenRouter returned invalid TikZ review data.');
  }

  const value = parsed as { errors: string[]; hasErrors: boolean; tikz: string };
  const errors = value.errors.map((error) => error.trim());
  const tikz = cleanTikzResponse(value.tikz);

  if (value.hasErrors !== (errors.length > 0)) {
    throw new Error('OpenRouter returned contradictory TikZ review details.');
  }

  return { errors, hasErrors: value.hasErrors, tikz };
}

function compactPreRenderForPrompt (result: TikzPreRenderResult): unknown {
  return {
    compiled: result.compiled,
    diagnostics: result.diagnostics.slice(-30),
    renderedSvg: result.renderedSvg.slice(0, 28_000),
    retryable: result.retryable === true,
    texInput: result.texInput.slice(0, 12_000)
  };
}

export function tikzFixReviewPrompt (language: string, target: ImageFixTarget, preRender: TikzPreRenderResult, learnerAge?: number): string {
  const exercise = target.ability.q[target.exerciseIndex];
  const purpose = target.field === 'p' ? 'question visual' : 'solution visual';

  return `Strictly review this learner-facing TikZ ${purpose}. The goal is not merely valid code: the rendered diagram must accurately realize the ORIGINAL VISUAL PROMPT for this concrete Ability exercise and must be clean and readable.

${MATH_DISPLAY_REQUIREMENTS_PROMPT}

During review or repair, slash-form mathematical fractions are errors and must be corrected. During review or repair, any number line that violates any of these requirements is an error and must be corrected.

You MUST inspect all of these classes of failure:
- TikZ Editor parse or SVG render failure. A successful render is mandatory.
- Semantic mismatch with the original visual prompt, concrete question, or correct answer.
- Wrong values, labels, geometry, axes, markings, regions, arrows, ordering, or missing required objects.
- For a question visual, accidental answer leakage or solved-state markings that the learner should infer.
- For a solution visual, missing or incorrect final answer/result.
- Visual mess: overlapping text, labels printed on top of unrelated labels/objects, clipped text, illegible density, lines/arrows passing through labels, badly placed annotations, ambiguous association between labels and objects, or excessive unused/competing content.
- Poor composition that makes the intended educational relationship hard to read.

Use the pre-render evidence below. The SVG is the actual browser rendering when compilation succeeded. If rendering failed, use the diagnostics/source input to repair the source. Preserve correct content and change only what is needed.

${LEARNER_AGE_PROMPT(learnerAge)}

Return ONLY JSON in this exact shape:
{"hasErrors":true,"errors":["Specific problem 1"],"tikz":"\\begin{tikzpicture}...\\end{tikzpicture}"}
If there are genuinely no problems, return hasErrors:false, errors:[], and the original TikZ unchanged in tikz.

Book language: ${language}
Ability: ${target.ability.h}
Exercise: ${exercise.h}
Correct answer: ${exercise.a}
Visual role: ${purpose}
Original visual prompt: ${target.prompt || '(No stored visual prompt is available; use the exercise and answer as the semantic source.)'}

ORIGINAL TIKZ:
${target.originalTikz}

PRE-RENDER RESULT:
${JSON.stringify(compactPreRenderForPrompt(preRender))}`;
}

export function tikzCompileRepairPrompt (language: string, target: ImageFixTarget, review: TikzAiReview, failedPreRender: TikzPreRenderResult, learnerAge?: number): string {
  const exercise = target.ability.q[target.exerciseIndex];

  return `The proposed TikZ correction still failed the application's real TikZ Editor pre-render. Repair the TikZ so it renders in TikZ Editor AND still satisfies the original visual specification. Keep all valid semantic/layout corrections already made.

${MATH_DISPLAY_REQUIREMENTS_PROMPT}

During review or repair, slash-form mathematical fractions are errors and must be corrected. During review or repair, any number line that violates any of these requirements is an error and must be corrected.

Return ONLY JSON in this exact shape:
{"hasErrors":true,"errors":["..."],"tikz":"\\begin{tikzpicture}...\\end{tikzpicture}"}
The errors array must include the original visual problems and the compile/render failure you fixed.

${LEARNER_AGE_PROMPT(learnerAge)}

Book language: ${language}
Ability: ${target.ability.h}
Exercise: ${exercise.h}
Correct answer: ${exercise.a}
Original visual prompt: ${target.prompt || '(missing)'}
Original TikZ: ${target.originalTikz}
Previously detected problems: ${JSON.stringify(review.errors)}
Rejected proposed TikZ: ${review.tikz}
Failed pre-render: ${JSON.stringify(compactPreRenderForPrompt(failedPreRender))}`;
}

export function tikzDetectedProblemsRepairPrompt (language: string, target: ImageFixTarget, review: TikzAiReview, preRender: TikzPreRenderResult, learnerAge?: number): string {
  const exercise = target.ability.q[target.exerciseIndex];

  return `You identified real problems in this TikZ visual but returned the original TikZ unchanged. Apply the required corrections now. The corrected TikZ must render in TikZ Editor, match the original visual prompt and concrete exercise, and resolve every listed layout/semantic problem.

${MATH_DISPLAY_REQUIREMENTS_PROMPT}

During review or repair, slash-form mathematical fractions are errors and must be corrected. During review or repair, any number line that violates any of these requirements is an error and must be corrected.

Return ONLY JSON in this exact shape:
{"hasErrors":true,"errors":["..."],"tikz":"\\begin{tikzpicture}...\\end{tikzpicture}"}
Keep the errors list specific. tikz MUST contain an actual corrected source different from the rejected original.

${LEARNER_AGE_PROMPT(learnerAge)}

Book language: ${language}
Ability: ${target.ability.h}
Exercise: ${exercise.h}
Correct answer: ${exercise.a}
Original visual prompt: ${target.prompt || '(missing)'}
Detected problems: ${JSON.stringify(review.errors)}
Pre-render: ${JSON.stringify(compactPreRenderForPrompt(preRender))}
Original/rejected TikZ:
${target.originalTikz}`;
}

function compactJsonRepairPrompt (candidate: string, validationError: string, repairContext: string): string {
  return `Repair the rejected JSON candidate. Preserve every correct semantic detail and make only the changes required by the parser error and compact contract. Return only the corrected JSON object; no commentary.

COMPACT CONTRACT:
${repairContext}

PARSER ERROR:
${validationError}

REJECTED CANDIDATE:
${candidate}`;
}

export async function requestValidatedJson<T> (client: OpenAI, model: string, systemPrompt: string, userPrompt: string, parse: (content: string) => T, jsonObject = true, onCost?: OpenRouterCostReporter, maxOutputTokens?: number, repairContext?: string, validationCycles = 2, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  let outputTokenBudget = maxOutputTokens;

  const request = async (prompt: string): Promise<string> => {
    try {
      return await requestChatContent(client, model, systemPrompt, prompt, jsonObject, onCost, outputTokenBudget, signal);
    } catch (error) {
      if (error instanceof AiResponseTruncatedError && outputTokenBudget !== undefined && outputTokenBudget < MAX_VALIDATED_JSON_OUTPUT_TOKENS) {
        outputTokenBudget = Math.min(MAX_VALIDATED_JSON_OUTPUT_TOKENS, Math.max(outputTokenBudget + 2_000, Math.ceil(outputTokenBudget * 1.5)));

        return requestChatContent(client, model, systemPrompt, prompt, jsonObject, onCost, outputTokenBudget, signal);
      }

      throw error;
    }
  };

  for (let attempt = 0; attempt < validationCycles; attempt++) {
    let candidate: string;

    try {
      candidate = await request(userPrompt);
    } catch (error) {
      lastError = error;
      continue;
    }

    try {
      // The parser is the fast local validation gate. In the normal case this
      // avoids the old unconditional second model call entirely.
      return parse(candidate);
    } catch (error) {
      lastError = error;
    }

    const validationError = lastError instanceof Error ? lastError.message : String(lastError ?? 'Local validation failed.');
    const validationPrompt = repairContext
      ? compactJsonRepairPrompt(candidate, validationError, repairContext)
      : JSON_VALIDATION_PROMPT(userPrompt, candidate, validationError);

    try {
      const repaired = await request(validationPrompt);

      return parse(repaired);
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'Unknown validation error.');

  throw new Error(`AI output remained invalid after local validation/repair: ${detail}`);
}
