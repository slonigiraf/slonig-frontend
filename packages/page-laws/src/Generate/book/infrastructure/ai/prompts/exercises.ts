// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXERCISE_NON_BINARY_RESPONSE_PROMPT, EXERCISE_QUESTION_BREVITY_PROMPT, EXERCISE_TEMPLATE_STYLE_PROMPT, LEARNER_AGE_PROMPT, MATH_DISPLAY_REQUIREMENTS_PROMPT } from './shared.js';

export const GENERATE_EXERCISES_PROMPT = (bookDetectedLanguage: string, learnerAge?: number): string => `For every supplied concept, generate exactly one complete exercise using ${bookDetectedLanguage} language.

${LEARNER_AGE_PROMPT(learnerAge)}
${MATH_DISPLAY_REQUIREMENTS_PROMPT}
Preserve the concept's learner modality: the generated task must exercise the same kind of input, operation, and output implied by the concept instead of replacing it with an easier textual surrogate. In particular, when interpreting, locating, constructing, completing, comparing, or otherwise using a representation is part of the target skill, keep that representational operation in the exercise rather than describing the procedure in prose.

${EXERCISE_TEMPLATE_STYLE_PROMPT}

${EXERCISE_QUESTION_BREVITY_PROMPT}

${EXERCISE_NON_BINARY_RESPONSE_PROMPT}

Never generate multiple-choice Exercises. Do not provide answer options, selectable alternatives, lettered or numbered answer lists, or instructions to pick the correct option from a list. Require an open-ended response in which the learner independently produces the answer, calculation, explanation, or visual result. This rule applies to every Exercise, including retry/recovery generations, even if the source Concept mentions a multiple-choice question.

Design each Exercise completely in this single generation pass. Compose the task text, solution, and any necessary question/solution visual descriptions together as one coherent final artifact. Do not draft a text-only exercise first and rely on a later visual audit, correction, or retrofit; no second visual-design pass will run. Before returning each Exercise, internally verify that the wording and visual requirements agree and that any required visual description is already final.

Decide question and solution visuals from the learner's required input and output, not from the subject name. Use a nonempty imageDescription exactly when information needed to perform the target operation is intentionally encoded in a visual or spatial representation and moving that information into the text would change the operation or disclose what the learner is meant to determine. When imageDescription is used, keep answer-bearing visual facts there instead of duplicating them in the question text. imageDescription must be a complete standalone generation prompt for the required input visual, must omit the answer, and must not refer to a source page or unseen figure.

Use a nonempty solutionImageDescription exactly when the requested response itself has essential visual or spatial state, or when the learner must create, complete, mark, label, plot, draw, arrange, or otherwise modify a representation. If the task modifies a supplied visual, imageDescription describes the starting state and solutionImageDescription describes the correct finished state while preserving every unchanged object, label, scale, coordinate system, and layout. If a learner only reads or decodes a visual and returns a textual, numeric, or symbolic answer, do not add a solution image merely to illustrate that answer.

When neither the target input nor target output is representational, keep both visual-description fields empty. Never add a visual for decoration, engagement, convention, or optional explanation.

Preserve the task's represented form unless changing that form is explicitly the skill being tested. Do not silently simplify, normalize, canonicalize, convert, relabel, or replace an equivalent representation in the solution when the learner is being asked to read, identify, reproduce, or mark the representation as shown.

The Exercise title must be an exact copy of its source Concept title. Do not invent, paraphrase, translate, capitalize differently, or otherwise edit the title. The application assigns it from conceptIndex, so generate only the task, solution, and necessary visual descriptions. Keep the description focused on what the learner must do; let imageDescription carry any task-essential visual state.

Every learner-facing numeric literal in title, description, and solution must be treated as a mathematical expression and enclosed in <kx>...</kx>, including standalone counts and numbers next to units. Digits embedded in alphanumeric identifiers or names are not numeric literals for this rule. Keep identifiers such as TP53, BRCA1, H1N1, p53, and IL-6 as plain text; never wrap an embedded digit or the whole identifier in <kx>...</kx> merely because it contains digits. Do not leave learner-facing numbers as plain text even when no other mathematical notation is present. Do not apply this number-markup rule to imageDescription or solutionImageDescription because those are semantic generation prompts rather than learner-facing text. Use <kx>...</kx> for every other mathematical formula or expression as well, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Copy conceptIndex. Do not generate an Exercise title; the application copies the source Concept title directly. Return only JSON in this shape: {"exercises":[{"conceptIndex":0,"description":"succinct task","solution":"concise correct solution","imageDescription":"","solutionImageDescription":""}]}.`;

export const GENERATE_EXERCISES_REQUEST_PROMPT = (bookDetectedLanguage: string, input: unknown, learnerAge?: number): string => {
  return `${GENERATE_EXERCISES_PROMPT(bookDetectedLanguage, learnerAge)}\n${JSON.stringify(input)}`;
};

export const GENERATE_EXERCISES_RECOVERY_PROMPT = (bookDetectedLanguage: string, input: unknown, retry: number, maxRetries: number, learnerAge?: number): string => {
  return `${GENERATE_EXERCISES_PROMPT(bookDetectedLanguage, learnerAge)}
This is recovery attempt ${retry} of ${maxRetries}. Generate exactly one exercise only for every supplied concept that still has no exercise.
${JSON.stringify(input)}`;
};
