// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';
import type { AbilityExerciseImagePrompts, GeneratedAbility } from './abilities.js';

import { parseGeneratedAbilities } from './abilities.js';
import { stripMarkdownImageReferences } from './bookImageRefs.js';

export type AbilityQuestionVisualMode = 'none' | 'required';
export type AbilitySolutionVisualMode = 'none' | 'new' | 'modify-question';

export interface AbilityBlueprint {
  exerciseId: number;
  input: string;
  method: string;
  operation: string;
  output: string;
  questionVisual: AbilityQuestionVisualMode;
  skillIndex: number;
  solutionVisual: AbilitySolutionVisualMode;
  title: string;
}

export interface BlueprintAbility {
  ability: GeneratedAbility;
  exerciseId: number;
  skillIndex: number;
}

export interface BlueprintVisualPlan {
  exerciseId: number;
  imagePrompts: [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];
  skillIndex: number;
}

export interface AtomicAbilityConversion extends BlueprintAbility {
  imagePrompts?: [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];
}

export interface AbilityWorkflowRunOptions {
  maxOutputTokens?: number;
  repairContext?: string;
  validationCycles?: number;
}

export type AbilityWorkflowJsonRunner = <T>(prompt: string, parse: (content: string) => T, options?: AbilityWorkflowRunOptions) => Promise<T>;

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString (value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseJson (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

function normalized (value: string): string {
  return value.toLocaleLowerCase().replace(/<kx>|<\/kx>/g, '').replace(/\s+/g, ' ').trim();
}


function expectedBlueprintKey (exerciseId: number, skillIndex: number): string {
  return `${exerciseId}:${skillIndex}`;
}

export function transportAbilitySourceExercises (exercises: Exercise[]): unknown[] {
  return exercises.map(({ abilityMode = 'reasoning', description, id, imageDescription = '', solution = '', solutionImageDescription = '', title }) => ({
    abilityMode,
    description: stripMarkdownImageReferences(description),
    id,
    imageDescription,
    solution,
    solutionImageDescription,
    title
  }));
}

export function transportCompactAbilitySourceExercise ({ abilityMode = 'reasoning', description, id, imageDescription = '', solution = '', solutionImageDescription = '', title }: Exercise): unknown {
  return {
    id,
    title,
    mode: abilityMode,
    task: stripMarkdownImageReferences(description),
    solution,
    questionVisual: imageDescription,
    solutionVisual: solutionImageDescription
  };
}

export function transportAbilityMaterializationEvidence ({ abilityMode = 'reasoning', id, imageDescription = '', solutionImageDescription = '', title }: Exercise): unknown {
  return {
    id,
    title,
    mode: abilityMode,
    questionVisual: imageDescription,
    solutionVisual: solutionImageDescription
  };
}

export function parseAbilityBlueprints (content: string, expectedExerciseIds: number[]): AbilityBlueprint[] {
  const parsed = parseJson(content);
  const plans = isRecord(parsed) ? parsed.plans : undefined;

  if (!Array.isArray(plans)) {
    throw new Error('OpenRouter returned invalid Ability blueprint data.');
  }

  const expected = new Set(expectedExerciseIds);
  const usedExercises = new Set<number>();
  const result: AbilityBlueprint[] = [];

  for (const plan of plans) {
    if (!isRecord(plan) || typeof plan.exerciseId !== 'number' || !Number.isSafeInteger(plan.exerciseId) || !expected.has(plan.exerciseId) || usedExercises.has(plan.exerciseId) || !Array.isArray(plan.skills) || plan.skills.length < 1 || plan.skills.length > 8) {
      throw new Error('Every source Exercise must have one blueprint plan with 1-8 atomic skills.');
    }

    const exerciseId = plan.exerciseId;

    usedExercises.add(exerciseId);
    const signatures = new Set<string>();

    plan.skills.forEach((skill, skillIndex) => {
      if (!isRecord(skill)) {
        throw new Error('Every Ability blueprint skill must be an object.');
      }

      const title = nonEmptyString(skill.title);
      const input = nonEmptyString(skill.input);
      const operation = nonEmptyString(skill.operation);
      const output = nonEmptyString(skill.output);
      const method = nonEmptyString(skill.method);
      const questionVisual = skill.questionVisual;
      const solutionVisual = skill.solutionVisual;

      if (!title || !input || !operation || !output || !method || (questionVisual !== 'none' && questionVisual !== 'required') || (solutionVisual !== 'none' && solutionVisual !== 'new' && solutionVisual !== 'modify-question')) {
        throw new Error('Every Ability blueprint must define title, input, one operation, output, method, and visual modes.');
      }

      if (solutionVisual === 'modify-question' && questionVisual !== 'required') {
        throw new Error('A modify-question solution visual requires a question visual.');
      }

      const signature = [title, input, operation, output, method].map(normalized).join('|');

      if (signatures.has(signature)) {
        throw new Error('An Exercise blueprint contains duplicate atomic skills.');
      }

      signatures.add(signature);
      result.push({ exerciseId, input, method, operation, output, questionVisual, skillIndex, solutionVisual, title });
    });
  }

  if (usedExercises.size !== expected.size) {
    throw new Error(`OpenRouter planned ${usedExercises.size} of ${expected.size} source Exercises.`);
  }

  return result;
}

export function parseBlueprintAbilities (content: string, blueprints: AbilityBlueprint[]): BlueprintAbility[] {
  const parsed = parseJson(content);
  const values = isRecord(parsed) ? parsed.abilities : undefined;

  if (!Array.isArray(values) || values.length !== blueprints.length) {
    throw new Error(`OpenRouter returned ${Array.isArray(values) ? values.length : 0} Abilities for ${blueprints.length} blueprints.`);
  }

  const expected = new Map(blueprints.map((blueprint) => [expectedBlueprintKey(blueprint.exerciseId, blueprint.skillIndex), blueprint] as const));
  const used = new Set<string>();
  const result: BlueprintAbility[] = [];
  const titlesByExercise = new Map<number, Set<string>>();

  values.forEach((value) => {
    if (!isRecord(value) || typeof value.exerciseId !== 'number' || !Number.isSafeInteger(value.exerciseId) || typeof value.skillIndex !== 'number' || !Number.isSafeInteger(value.skillIndex)) {
      throw new Error('Every generated Ability must identify its source Exercise and blueprint index.');
    }

    const key = expectedBlueprintKey(value.exerciseId, value.skillIndex);

    if (!expected.has(key) || used.has(key)) {
      throw new Error('OpenRouter returned an unknown or duplicate Ability blueprint key.');
    }

    const blueprint = expected.get(key) as AbilityBlueprint;
    const [ability] = parseGeneratedAbilities(JSON.stringify([value.ability]), 1, { allowIdenticalQuestionText: blueprint.questionVisual === 'required' });

    if (normalized(ability.h) !== normalized(blueprint.title)) {
      throw new Error('Generated Ability title must match its audited atomic blueprint.');
    }

    const exerciseTitles = titlesByExercise.get(value.exerciseId) ?? new Set<string>();
    const normalizedTitle = normalized(ability.h);

    if (exerciseTitles.has(normalizedTitle)) {
      throw new Error('Two atomic Abilities from the same source Exercise have the same skill title.');
    }

    exerciseTitles.add(normalizedTitle);
    titlesByExercise.set(value.exerciseId, exerciseTitles);
    used.add(key);
    result.push({ ability, exerciseId: value.exerciseId, skillIndex: value.skillIndex });
  });

  if (used.size !== expected.size) {
    throw new Error('OpenRouter omitted one or more Ability blueprints.');
  }

  return result.sort((a, b) => a.exerciseId - b.exerciseId || a.skillIndex - b.skillIndex);
}

function parseImagePromptPair (value: unknown): [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error('Every visual plan must contain exactly two image prompt decisions.');
  }

  const prompts = value.map((item) => {
    if (!isRecord(item) || typeof item.changesImage !== 'boolean' || typeof item.p !== 'string' || typeof item.i !== 'string') {
      throw new Error('Every visual decision must contain changesImage, p, and i.');
    }

    return { changesImage: item.changesImage, i: item.i.trim(), p: item.p.trim() };
  }) as [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];

  return prompts;
}

export function parseBlueprintVisualPlans (content: string, blueprints: AbilityBlueprint[]): BlueprintVisualPlan[] {
  const visualBlueprints = blueprints.filter(({ questionVisual, solutionVisual }) => questionVisual === 'required' || solutionVisual !== 'none');

  if (!visualBlueprints.length) {
    return [];
  }

  const parsed = parseJson(content);
  const values = isRecord(parsed) ? parsed.plans : undefined;

  if (!Array.isArray(values) || values.length !== visualBlueprints.length) {
    throw new Error(`OpenRouter returned ${Array.isArray(values) ? values.length : 0} visual plans for ${visualBlueprints.length} visual Abilities.`);
  }

  const expected = new Map(visualBlueprints.map((blueprint) => [expectedBlueprintKey(blueprint.exerciseId, blueprint.skillIndex), blueprint] as const));
  const used = new Set<string>();
  const result: BlueprintVisualPlan[] = [];

  values.forEach((value) => {
    if (!isRecord(value) || typeof value.exerciseId !== 'number' || !Number.isSafeInteger(value.exerciseId) || typeof value.skillIndex !== 'number' || !Number.isSafeInteger(value.skillIndex)) {
      throw new Error('Every visual plan must identify its Ability blueprint.');
    }

    const key = expectedBlueprintKey(value.exerciseId, value.skillIndex);
    const blueprint = expected.get(key);

    if (!blueprint || used.has(key)) {
      throw new Error('OpenRouter returned an unknown or duplicate Ability visual plan.');
    }

    const imagePrompts = parseImagePromptPair(value.imagePrompts).map((prompt) => {
      // The audited blueprint is the source of truth. Models occasionally add
      // an explanatory solution image to an otherwise text-answer Ability.
      // Treat that as harmless over-generation and strip it locally instead of
      // failing the whole atomic Ability attempt (and all of its retries).
      const p = blueprint.questionVisual === 'none' ? '' : prompt.p;

      if (blueprint.solutionVisual === 'none') {
        return { changesImage: false, i: '', p };
      }

      if (blueprint.solutionVisual === 'new') {
        return { changesImage: false, i: prompt.i, p };
      }

      return { ...prompt, p };
    }) as [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];

    imagePrompts.forEach(({ changesImage, i, p }) => {
      if ((blueprint.questionVisual === 'required') !== Boolean(p)) {
        throw new Error('Question visual prompt does not match the Ability blueprint.');
      }

      if (blueprint.solutionVisual === 'new' && (changesImage || !i)) {
        throw new Error('A new solution visual must have i and changesImage:false.');
      }

      if (blueprint.solutionVisual === 'modify-question' && (!changesImage || !i || !p)) {
        throw new Error('A modified solution visual must include both starting and completed visual prompts.');
      }
    });

    used.add(key);
    result.push({ exerciseId: value.exerciseId, imagePrompts, skillIndex: value.skillIndex });
  });

  return result.sort((a, b) => a.exerciseId - b.exerciseId || a.skillIndex - b.skillIndex);
}

export function parseAtomicAbilityMaterialization (content: string, blueprints: AbilityBlueprint[]): AtomicAbilityConversion[] {
  const parsed = parseJson(content);
  const values = isRecord(parsed) ? parsed.abilities : undefined;

  if (!Array.isArray(values) || values.length !== blueprints.length) {
    throw new Error(`OpenRouter returned ${Array.isArray(values) ? values.length : 0} materialized Abilities for ${blueprints.length} blueprints.`);
  }

  const abilities = parseBlueprintAbilities(JSON.stringify({ abilities: values }), blueprints);
  const expectedByKey = new Map(blueprints.map((blueprint) => [expectedBlueprintKey(blueprint.exerciseId, blueprint.skillIndex), blueprint] as const));
  const visualRows: unknown[] = [];

  for (const value of values) {
    if (!isRecord(value) || typeof value.exerciseId !== 'number' || typeof value.skillIndex !== 'number') {
      continue; // parseBlueprintAbilities reports the precise structural failure.
    }

    const blueprint = expectedByKey.get(expectedBlueprintKey(value.exerciseId, value.skillIndex));

    if (!blueprint) {
      continue;
    }

    const requiresVisual = blueprint.questionVisual === 'required' || blueprint.solutionVisual !== 'none';

    if (requiresVisual) {
      visualRows.push({ exerciseId: value.exerciseId, imagePrompts: value.imagePrompts, skillIndex: value.skillIndex });
      continue;
    }

    if ('imagePrompts' in value) {
      const pair = parseImagePromptPair(value.imagePrompts);

      if (pair.some(({ changesImage, i, p }) => changesImage || i || p)) {
        throw new Error('A text-only Ability must not create visual prompts.');
      }
    }
  }

  const visualPlans = visualRows.length
    ? parseBlueprintVisualPlans(JSON.stringify({ plans: visualRows }), blueprints)
    : [];

  return assembleAtomicAbilityConversions(blueprints, abilities, visualPlans);
}

export function validateAbilityBlueprintEvidence (blueprints: AbilityBlueprint[], exercises: Exercise[]): void {
  const sourceById = new Map(exercises.flatMap((exercise) => exercise.id === undefined ? [] : [[exercise.id, exercise] as const]));
  const blueprintsByExerciseId = new Map<number, AbilityBlueprint[]>();

  blueprints.forEach((blueprint) => {
    const source = sourceById.get(blueprint.exerciseId);

    if (!source) {
      throw new Error(`Ability blueprint refers to unknown Exercise ${blueprint.exerciseId}.`);
    }

    const rows = blueprintsByExerciseId.get(blueprint.exerciseId) ?? [];

    rows.push(blueprint);
    blueprintsByExerciseId.set(blueprint.exerciseId, rows);

    const hasQuestionVisual = Boolean(source.imageDescription?.trim());
    const hasSolutionVisual = Boolean(source.solutionImageDescription?.trim());

    // Stage 4 has already audited Exercise visual semantics. Treat those fields
    // as evidence boundaries so the Ability workflow cannot invent a visual
    // dependency merely because an image might be pedagogically attractive.
    if (blueprint.questionVisual === 'required' && !hasQuestionVisual) {
      throw new Error(`Ability blueprint ${blueprint.exerciseId}:${blueprint.skillIndex} invented a question visual not present in the repaired source Exercise.`);
    }

    if (blueprint.solutionVisual !== 'none' && !hasSolutionVisual) {
      throw new Error(`Ability blueprint ${blueprint.exerciseId}:${blueprint.skillIndex} invented a solution visual not present in the repaired source Exercise.`);
    }
  });

  exercises.forEach((source) => {
    if (source.id === undefined) {
      return;
    }

    const rows = blueprintsByExerciseId.get(source.id) ?? [];

    // The reverse check is equally important: a required source visual must not
    // disappear during atomic decomposition. It may belong to only one of the
    // split skills, but at least one skill must carry each required visual role.
    if (source.imageDescription?.trim() && !rows.some(({ questionVisual }) => questionVisual === 'required')) {
      throw new Error(`Ability blueprint plan for Exercise ${source.id} dropped its required question visual.`);
    }

    if (source.solutionImageDescription?.trim() && !rows.some(({ solutionVisual }) => solutionVisual !== 'none')) {
      throw new Error(`Ability blueprint plan for Exercise ${source.id} dropped its required solution visual.`);
    }
  });
}

export function assembleAtomicAbilityConversions (blueprints: AbilityBlueprint[], abilities: BlueprintAbility[], visualPlans: BlueprintVisualPlan[]): AtomicAbilityConversion[] {
  const visualPlanByKey = new Map(visualPlans.map((plan) => [expectedBlueprintKey(plan.exerciseId, plan.skillIndex), plan] as const));

  return abilities.map((candidate) => {
    const key = expectedBlueprintKey(candidate.exerciseId, candidate.skillIndex);
    const blueprint = blueprints.find(({ exerciseId, skillIndex }) => expectedBlueprintKey(exerciseId, skillIndex) === key);
    const visualPlan = visualPlanByKey.get(key);

    if (!blueprint) {
      throw new Error('Generated Ability has no audited blueprint.');
    }

    if ((blueprint.questionVisual === 'required' || blueprint.solutionVisual !== 'none') && !visualPlan) {
      throw new Error('A visual Ability is missing its visual plan.');
    }

    if (blueprint.questionVisual === 'none' && blueprint.solutionVisual === 'none' && visualPlan) {
      throw new Error('A text-only Ability received an unexpected visual plan.');
    }

    if (blueprint.questionVisual === 'required') {
      const [firstQuestion, secondQuestion] = candidate.ability.q;
      const sameQuestionText = normalized(firstQuestion.h) === normalized(secondQuestion.h);
      const firstVisual = visualPlan?.imagePrompts[0].p ?? '';
      const secondVisual = visualPlan?.imagePrompts[1].p ?? '';

      // A visual Ability may intentionally use the same instruction twice
      // (for example, "Read the value shown") as long as each question carries
      // different concrete data in its required visual. Validate the complete
      // learner input rather than question text alone.
      if (sameQuestionText && normalized(firstVisual) === normalized(secondVisual)) {
        throw new Error('The two Ability exercises must use different concrete input parameters in their text or question visuals.');
      }
    }

    return { ...candidate, ...(visualPlan ? { imagePrompts: visualPlan.imagePrompts } : {}) };
  });
}

export async function planAtomicAbilityExercise (
  language: string,
  chapterTitle: string,
  exercise: Exercise,
  runJson: AbilityWorkflowJsonRunner
): Promise<AbilityBlueprint[]> {
  if (exercise.id === undefined) {
    throw new Error('Every source Exercise must have one unique id before Ability generation.');
  }

  const exerciseId = exercise.id;
  const source = transportCompactAbilitySourceExercise(exercise);
  const parseBlueprintStage = (content: string): AbilityBlueprint[] => {
    const blueprints = parseAbilityBlueprints(content, [exerciseId]);

    validateAbilityBlueprintEvidence(blueprints, [exercise]);

    return blueprints;
  };

  return runJson(
    abilityBlueprintRequestPrompt(language, chapterTitle, [source]),
    parseBlueprintStage,
    {
      maxOutputTokens: 1_800,
      repairContext: `Expected exerciseId=${exerciseId}. Return one plans[] entry with 1-8 skills. Source question visual present=${Boolean(exercise.imageDescription?.trim())}; source solution visual present=${Boolean(exercise.solutionImageDescription?.trim())}.`,
      validationCycles: 1
    }
  );
}

export async function materializeAtomicAbilityExercise (
  language: string,
  chapterTitle: string,
  exercise: Exercise,
  blueprints: AbilityBlueprint[],
  runJson: AbilityWorkflowJsonRunner
): Promise<AtomicAbilityConversion[]> {
  if (exercise.id === undefined || !blueprints.length || blueprints.some(({ exerciseId }) => exerciseId !== exercise.id)) {
    throw new Error('Ability materialization requires a nonempty blueprint set for exactly one source Exercise.');
  }

  const exerciseId = exercise.id;
  const materializationEvidence = transportAbilityMaterializationEvidence(exercise);

  return runJson(
    abilityMaterializationPrompt(language, chapterTitle, blueprints, materializationEvidence),
    (content) => parseAtomicAbilityMaterialization(content, blueprints),
    {
      maxOutputTokens: 4_500,
      repairContext: `Return exactly ${blueprints.length} abilities[] entries for exerciseId=${exerciseId}, with skillIndex values ${blueprints.map(({ skillIndex }) => skillIndex).join(',')}. Keep each ability title identical to its blueprint title and honor each blueprint visual mode.`,
      validationCycles: 1
    }
  );
}

export async function runAtomicAbilityWorkflow (
  language: string,
  chapterTitle: string,
  exercises: Exercise[],
  runJson: AbilityWorkflowJsonRunner
): Promise<AtomicAbilityConversion[]> {
  const expectedExerciseIds = exercises.flatMap(({ id }) => id === undefined ? [] : [id]);

  if (expectedExerciseIds.length !== exercises.length || new Set(expectedExerciseIds).size !== exercises.length) {
    throw new Error('Every source Exercise must have one unique id before Ability generation.');
  }

  // Compatibility composition for callers that still want a one-function
  // workflow. The live UI calls the two stages separately and caches their
  // outputs so a materialization retry never regenerates the blueprint.
  const results: AtomicAbilityConversion[] = [];

  for (const exercise of exercises) {
    const blueprints = await planAtomicAbilityExercise(language, chapterTitle, exercise, runJson);
    const conversions = await materializeAtomicAbilityExercise(language, chapterTitle, exercise, blueprints, runJson);

    results.push(...conversions);
  }

  return results;
}

export function abilityBlueprintRequestPrompt (language: string, chapterTitle: string, exercises: unknown[]): string {
  return `Plan atomic practice skills for the supplied source Exercise. Planning only; do not write learner questions.

Chapter: ${chapterTitle}
Language: ${language}

Create 1-8 independently practicable skills actually trained by the source. Each skill must have exactly one stable input type, one learner operation, one output type, and one stable method. Split independently variable operations/methods; do not invent prerequisites or artificial micro-steps. Keep titles short and observable.

Visual contract: questionVisual="required" only when the learner must inspect task-essential visual/spatial information that cannot be moved into text without changing or revealing the task. solutionVisual="new" only for a newly created visual answer, "modify-question" only when the answer changes the supplied question visual, otherwise "none". A modify-question solution requires questionVisual="required". Never request decorative visuals.

Return only JSON:
{"plans":[{"exerciseId":123,"skills":[{"title":"Short skill","input":"input type","operation":"one operation","output":"output type","method":"stable method","questionVisual":"none","solutionVisual":"none"}]}]}

SOURCE (normally exactly one Exercise):
${JSON.stringify(exercises)}`;
}

export function abilityMaterializationPrompt (language: string, chapterTitle: string, blueprints: AbilityBlueprint[], source: unknown): string {
  return `Materialize the exact atomic plan into final learner Abilities. Do not add, remove, merge, split, rename, or broaden planned skills.

Chapter: ${chapterTitle}
Language: ${language}

For every blueprint create exactly one Ability with exactly two concrete practice instances. Copy blueprint.title to ability.h unchanged. Both instances must use the same input type, operation, output type, method, direction, reasoning depth, and difficulty; vary only concrete data and independently recalculate each answer. Keep tasks direct (normally <=32 words), answers compact (normally <=38 words), and titles <=12 words. No hints, tutorial prose, answer choices, book references, or redundant explanation. Use <kx>...</kx> for mathematical notation. ability.i="", t=3, and q[].p/q[].i remain empty because images are materialized later.

For every item also return two imagePrompts entries, one per question. For text-only blueprints all p/i must be "" and changesImage=false. If questionVisual="required", p must be a complete standalone starting-visual specification with the concrete values/labels/geometry for that question and no answer leakage. If solutionVisual="new", i must be the complete correct finished visual and changesImage=false. If solutionVisual="modify-question", p and i must both be complete specifications of the same visual, changesImage=true, and i must preserve every unchanged object/layout while applying only the correct answer change. Do not create optional/decorative visuals.

Return only JSON:
{"abilities":[{"exerciseId":123,"skillIndex":0,"ability":{"i":"","t":3,"h":"Short skill","q":[{"h":"Task 1","a":"Answer 1","p":"","i":""},{"h":"Task 2","a":"Answer 2","p":"","i":""}]},"imagePrompts":[{"changesImage":false,"p":"","i":""},{"changesImage":false,"p":"","i":""}]}]}

ATOMIC PLAN:
${JSON.stringify(blueprints)}

SOURCE VISUAL EVIDENCE (single Exercise; the atomic plan already carries the semantic contract):
${JSON.stringify(source)}`;
}

export function abilityBlueprintAuditPrompt (language: string, chapterTitle: string, exercises: unknown[], draft: AbilityBlueprint[]): string {
  return `Audit an internal Ability plan before any learner-facing content is generated. Rewrite the complete plan where necessary.

Chapter: ${chapterTitle}
Language: ${language}

The main failure to prevent is a non-atomic Ability. For each source Exercise, verify that every planned skill contains one observable operation with one input/output contract and one stable method. Split a skill if different operations, directions, methods, output forms, or reasoning depths could vary independently. Merge only artificial micro-steps that are not meaningful standalone practice. Remove skills not supported by the source. Preserve visual dependence only when it belongs to that exact atomic skill.

Keep 1-8 useful atomic skills per source Exercise; do not merge independent operations merely to stay below a preferred count. Return exactly the same JSON shape as a fresh plan and no commentary:
{"plans":[{"exerciseId":123,"skills":[{"title":"Short observable skill","input":"general input type","operation":"one learner operation","output":"general output type","method":"stable method/rule","questionVisual":"none","solutionVisual":"none"}]}]}

Source Exercises:
${JSON.stringify(exercises)}

Draft plan:
${JSON.stringify(draft)}`;
}

export function abilityTextGenerationPrompt (language: string, chapterTitle: string, blueprints: AbilityBlueprint[], exercises: unknown[]): string {
  return `Generate learner-facing Ability text from the audited atomic blueprints below. Visuals are handled later; q[].p and q[].i must remain empty strings.

Chapter: ${chapterTitle}
Language: ${language}

For each blueprint, create exactly one Ability with exactly two concrete practice instances. Copy the blueprint title into Ability h unchanged. Both instances must implement the blueprint's same input type, operation, output type, method, direction, reasoning depth, and difficulty; vary only task data. Recalculate each answer independently. For text-input tasks, the two q[].h strings must contain different concrete parameters and must not be identical. When questionVisual=\"required\", the instruction wording may be identical only if the later two question visuals will carry different concrete task data.

Make the wording economical. A task should normally be one direct imperative sentence plus only the data needed to perform it. Do not add teaching context, motivational text, hints, definitions, answer choices, "explain your answer" unless explanation is itself the atomic operation, or references to the book. The answer should be the shortest correct response that demonstrates the target operation: usually the result, or the result plus one compact derivation when the method must be checkable. Do not restate the question, teach the rule, narrate obvious steps, or write tutorial-style prose for an atomic task. Keep all essential information; brevity must never make the task ambiguous.

Do not encode visual facts in text when questionVisual is required. If solutionVisual is new or modify-question, the textual answer may state a concise result, but do not replace the required visual output with a verbose verbal description.

Use <kx>...</kx> for mathematical notation and valid JSON escaping. i="", t=3, and every q has h, a, p="", i="".

Return only JSON:
{"abilities":[{"exerciseId":123,"skillIndex":0,"ability":{"i":"","t":3,"h":"Short skill title","q":[{"h":"Task 1","a":"Answer 1","p":"","i":""},{"h":"Task 2","a":"Answer 2","p":"","i":""}]}}]}

Audited blueprints:
${JSON.stringify(blueprints)}

Source evidence:
${JSON.stringify(exercises)}`;
}

export function abilityTextAuditPrompt (language: string, chapterTitle: string, blueprints: AbilityBlueprint[], exercises: unknown[], candidates: BlueprintAbility[]): string {
  return `Act as the semantic quality gate for generated atomic Abilities. Return the complete corrected set, not a review report.

Chapter: ${chapterTitle}
Language: ${language}

For every candidate verify against its exact blueprint and source evidence: atomicity; same operation/method/direction in both questions; distinct data; factual and mathematical correctness; self-containment; no answer leakage; correct language; and strict visual dependence. For text-input tasks, never leave the two q[].h strings identical; change the concrete parameters. When questionVisual=\"required\", identical instruction wording is allowed only when the two later question visuals will contain different concrete inputs. Most importantly, enforce the learner-facing size budget: titles should fit in about 12 words, tasks in about 32 words, and answers in about 38 words. Keep each task direct and concrete and each answer as short as correctness permits. Delete explanations, restatements, teaching prose, and redundant intermediate steps that are not needed to demonstrate the atomic skill. Do not remove data, conditions, units, or reasoning that is genuinely required.

If a candidate accidentally combines multiple operations, repair it to the single operation specified by its blueprint rather than broadening the blueprint. Visual bytes and prompts are not created in this stage; p and i stay empty.

Return only JSON in exactly this shape and preserve every exerciseId/skillIndex pair:
{"abilities":[{"exerciseId":123,"skillIndex":0,"ability":{"i":"","t":3,"h":"Short skill title","q":[{"h":"Task 1","a":"Answer 1","p":"","i":""},{"h":"Task 2","a":"Answer 2","p":"","i":""}]}}]}

Blueprints:
${JSON.stringify(blueprints)}

Source evidence:
${JSON.stringify(exercises)}

Candidates:
${JSON.stringify(candidates)}`;
}

export function abilityVisualPlanningPrompt (language: string, chapterTitle: string, blueprints: AbilityBlueprint[], abilities: BlueprintAbility[], exercises: unknown[]): string {
  const visualBlueprints = blueprints.filter(({ questionVisual, solutionVisual }) => questionVisual === 'required' || solutionVisual !== 'none');
  const visualKeys = new Set(visualBlueprints.map(({ exerciseId, skillIndex }) => expectedBlueprintKey(exerciseId, skillIndex)));
  const visualAbilities = abilities.filter(({ exerciseId, skillIndex }) => visualKeys.has(expectedBlueprintKey(exerciseId, skillIndex)));

  return `Create generation specifications only for the required educational visuals of these already-final Abilities. Do not rewrite Ability text.

Chapter: ${chapterTitle}
Language: ${language}

For each visual Ability and each of its two questions, write a complete standalone visual specification with exact labels, values, shapes, coordinates, relationships, scale, and layout needed for that concrete question. The visual must be mechanically checkable against the final question and answer.

If questionVisual="none", p must be "". If questionVisual="required", p must be nonempty and must contain only the starting information the learner may inspect; never leak the answer. If solutionVisual="none", i must be "" and changesImage=false. If solutionVisual="new", i must be a complete correct finished visual, changesImage=false. If solutionVisual="modify-question", p and i must both be nonempty, changesImage=true, and i must describe the complete correct updated version of the same p visual while preserving every unchanged object, label, scale, coordinate system, and layout.

Prefer simple diagrammatic specifications that can be rendered as SVG when the semantics are geometric, symbolic, graphical, tabular, or spatial. Do not request decorative images.

Return only JSON:
{"plans":[{"exerciseId":123,"skillIndex":0,"imagePrompts":[{"changesImage":false,"p":"Starting visual specification","i":""},{"changesImage":true,"p":"Starting visual specification","i":"Complete correct updated visual specification"}]}]}

Visual blueprints:
${JSON.stringify(visualBlueprints)}

Final Abilities:
${JSON.stringify(visualAbilities)}

Source visual evidence:
${JSON.stringify(exercises)}`;
}

export function abilityVisualAuditPrompt (
  language: string,
  chapterTitle: string,
  blueprints: AbilityBlueprint[],
  abilities: BlueprintAbility[],
  exercises: unknown[],
  draftPlans: BlueprintVisualPlan[]
): string {
  const visualBlueprints = blueprints.filter(({ questionVisual, solutionVisual }) => questionVisual === 'required' || solutionVisual !== 'none');
  const visualKeys = new Set(visualBlueprints.map(({ exerciseId, skillIndex }) => expectedBlueprintKey(exerciseId, skillIndex)));
  const visualAbilities = abilities.filter(({ exerciseId, skillIndex }) => visualKeys.has(expectedBlueprintKey(exerciseId, skillIndex)));

  return `Audit the visual specifications for final atomic Abilities before any image is generated. Return the complete corrected visual plan, not a review report.

Chapter: ${chapterTitle}
Language: ${language}

For every Ability question, compare the draft p/i specifications against the exact final task text, exact final answer, audited visual mode, and source visual evidence. Correct every wrong number, label, symbol, coordinate, shape, scale, relation, missing object, and unsupported extra object. The specification must be sufficient for a renderer to create a mechanically checkable visual without guessing.

For questionVisual="required", p must encode all and only task-essential starting information and must not reveal the answer. For solutionVisual="new", i must encode the complete correct visual answer. For solutionVisual="modify-question", i must describe the complete updated version of the same p visual: preserve every unchanged object, label, coordinate system, scale, and layout, and apply only the answer change. Do not turn visual information into learner-facing text and do not add decorative imagery.

Return only JSON in the same shape and preserve every exerciseId/skillIndex pair:
{"plans":[{"exerciseId":123,"skillIndex":0,"imagePrompts":[{"changesImage":false,"p":"Starting visual specification","i":""},{"changesImage":true,"p":"Starting visual specification","i":"Complete correct updated visual specification"}]}]}

Audited blueprints:
${JSON.stringify(visualBlueprints)}

Final Abilities:
${JSON.stringify(visualAbilities)}

Source visual evidence:
${JSON.stringify(exercises)}

Draft visual plans:
${JSON.stringify(draftPlans)}`;
}

