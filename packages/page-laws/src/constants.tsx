// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const QR_CODE_SIZE = 300;
export const sessionPrefix = 'knowledge';

export const OPENAI_MODELS = [
  { text: 'GPT-4o mini: $0.15/$0.60', value: 'openai/gpt-4o-mini' },
  { text: 'GPT-4o: $2.50/$10', value: 'openai/gpt-4o' },
  { text: 'GPT-4.1 mini: $0.40/$1.60', value: 'openai/gpt-4.1-mini' },
  { text: 'GPT-4.1: $2/$8', value: 'openai/gpt-4.1' },
  { text: 'GPT-5 mini: $0.25/$2', value: 'openai/gpt-5-mini' },
  { text: 'GPT-5: $1.25/$10', value: 'openai/gpt-5' },
  { text: 'GPT-5.4: $2.50/$15', value: 'openai/gpt-5.4' }
];

const skillTemplateGenerationExample = String.raw`[
  {
    "i": "",
    "t": 3,
    "h": "Convert whole kilometers to meters",
    "q": [
      {
        "h": "Convert <kx>2</kx> km to m.",
        "a": "<kx>2 \\times 1000 = 2000</kx> m.",
        "p": "",
        "i": ""
      },
      {
        "h": "Convert <kx>5</kx> km to m.",
        "a": "<kx>5 \\times 1000 = 5000</kx> m.",
        "p": "",
        "i": ""
      }
    ]
  }
]`;

const skillTemplateGenerationInstructions = `A mental function is an abstraction describing a real human skill: one precisely stated ability a person can demonstrate by performing a task. Define it narrowly enough that the kind of input, expected output, and method are unambiguous. Name this observable skill in h. A broad topic such as "metric conversion" or "grammar" is not a sufficiently specific skill.

For each skill, plan one exercise template internally, then choose exactly two different sets of concrete parameters and fill them in to produce the two exercises in q. Both exercises must train the same skill and have identical instructions, wording, task structure, input and output types, operation or classification rule, conversion direction, solution method, number of reasoning steps, and difficulty. Only task data, such as numbers, names, words, or the sentence being analyzed, and the corresponding answer values may change. Avoid values that introduce an extra step, special case, or different strategy.

Require the learner to perform the skill and produce an answer independently. Do not generate yes/no, true/false, multiple-choice, or choose-from-a-list questions. Avoid trivial recognition, merely naming the concept described in the question, repeating a supplied fact, or questions whose wording already reveals the answer. Changing a chemical symbol, name, or number in such a question does not make it useful practice. Adding "explain why" to an obvious yes/no question is not an adequate fix; redesign the task so the learner must calculate, construct, transform, or apply the concept to concrete data. A short numeric, symbolic, or textual answer is fine when obtaining it requires performing the target skill. Keep the work appropriate to the learner and the narrow skill; do not add unrelated steps or advanced concepts just to make it harder.

Positive example: "Convert 2 km to m." and "Convert 5 km to m." both train conversion from kilometers to meters by multiplying by 1000. Negative example: converting km to m in one exercise and m to km in the other trains two different skills and must not be one pair. Operators, conversion units and direction, and the required reasoning stay fixed; they are not parameters to vary.

Chemistry example: reject "Is there ionization when Na loses one electron? (Yes/No)". For the skill "Determine an ion's charge from electron loss", a suitable pair is "A neutral Na atom has 11 protons and loses one electron. Determine how many electrons remain and calculate the ion's charge using the proton and electron counts." and "A neutral K atom has 19 protons and loses one electron. Determine how many electrons remain and calculate the ion's charge using the proton and electron counts." The respective solutions are "Initially 11 electrons; 11 - 1 = 10 remain. Charge in elementary-charge units: 11 - 10 = +1, so the ion is Na+." and "Initially 19 electrons; 19 - 1 = 18 remain. Charge in elementary-charge units: 19 - 18 = +1, so the ion is K+." The learner applies charge accounting instead of confirming a definition.

Nonmathematical example: 'Rewrite "They walk to school." in the simple past tense.' and 'Rewrite "They jump over puddles." in the simple past tense.' train the same sentence-transformation skill. The respective answers are 'They walked to school.' and 'They jumped over puddles.'. Keep the grammatical structure and transformation rule fixed while changing the sentence data. If classification is the target skill, require the learner to derive and justify the classification from the item's properties without presenting answer choices.

Provide a correct answer or concise worked solution in a for each exercise. Work out both answers using the same steps before responding. All questions and answers must be self-contained, original, appropriate to the supplied material, and written in the input language. Do not refer to an unseen image, diagram, source page, or previous exercise. Use <kx>...</kx> for mathematical notation where helpful, escaping every LaTeX backslash so the output remains valid JSON.

Preserve this existing JSON array format exactly: each skill has i, t, h, and q; i is an empty string and t is 3. Each q contains exactly two exercises, each with h, a, p, and i; p and i are empty strings. Return fully written exercises and answers, with all parameter values already substituted. Do not add fields or output the internal exercise template, parameter definitions, or unresolved placeholders. Return only valid JSON without markdown fences or commentary.

Example output:
${skillTemplateGenerationExample}

Before responding, verify that each pair demonstrates the same narrow human skill, differs only in concrete parameter values, has distinct task inputs, and has correct answers obtained through the same method. Confirm that both exercises require the learner to produce an answer by performing the skill, with no yes/no, true/false, answer choices, or trivial recognition shortcuts. Revise any pair that fails these checks.`;

export const skillListPrompt = `Identify the distinct human skills trained by the exercises in the supplied file or images. Split a broad skill into separate narrow skills whenever the required input/output mapping, method, direction, or task structure differs. Return one skill template for each narrow skill, ordered from easiest to hardest, with exactly two similar parameterized exercises per template.

${skillTemplateGenerationInstructions}`;

export const conceptsToSkillsPrompt = `You are an educational content methodologist. Convert the supplied concepts to skill templates one-to-one, preserving their order. For each concept, choose one specific human skill it supports, plan an exercise template internally, and generate exactly two concrete exercises from it. If a concept is broad, choose one representative narrow skill; do not combine different abilities in its two exercises. Kee original language. Return one skill template for each concept in the existing JSON array format below.

${skillTemplateGenerationInstructions}`;

export const sourcesToSkillsPrompt = `You are an educational content methodologist. Convert each supplied book concept or book exercise into exactly one smallest useful, narrow, observable skill. Preserve the source-item order and return one skill for every source item, even when two source items appear similar. Each skill must state an unambiguous input, operation, and expected output. Do not merge items, omit items, generate multiple skills for one item, use broad topic names, or invent unsupported material.

The request supplies the book's ISO 639-1 language code. Write every generated skill title and description strictly in that language. A ru book must produce Russian skills and a tr book must produce Turkish skills. Never infer a different output language or default to English because these instructions and JSON field names are English. Keep formulas, symbols, and proper names unchanged where appropriate.

Return only valid JSON in this exact shape:
{"skills":[{"title":"Narrow observable skill","description":"What the learner can do, including the relevant method and expected output"}]}

Use <kx>...</kx> for every mathematical formula or mathematical expression. Do not use dollar-delimited LaTeX. Escape every LaTeX backslash for valid JSON. Do not add markdown fences or commentary.`;

export const deduplicateAndSortSkillsPrompt = `Review the supplied skills from one chapter. Identify semantic duplicates and keep the clearest, most atomic version of each skill. Then order the remaining skill IDs from easiest to hardest using Vygotsky's Zone of Proximal Development: immediate prerequisites first, followed by skills made reachable through those prerequisites.

Return only valid JSON in this exact shape:
{"deleteIds":[1,2],"sortedIds":[3,4,5]}

Every supplied ID must appear exactly once in either deleteIds or sortedIds. Do not invent IDs. Do not add markdown fences or commentary.`;

export const skillsToExerciseTemplatesPrompt = `For each supplied skill, preferably create five simple practice templates, one for each ability mode in this order: perceptual observation, perceptual discrimination, transformation, reasoning, and generation. Five templates per skill is the preferred result, but return as many useful templates as the material supports; fewer or more are acceptable. Every template must train only its supplied skill and remain within the learner's Zone of Proximal Development. The text must be a complete, self-contained exercise; the solution must be complete and correct. Preserve the supplied skill order.

Write every title, text, and solution strictly in the supplied book language. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON.

Return only valid JSON in this shape:
{"templates":[{"bookSkillId":1,"title":"Ability mode: task","text":"Complete exercise","solution":"Complete solution"}]}

Use only supplied bookSkillId values. Do not add markdown fences or commentary.`;

export const skillsToExercisesPrompt = `You are an educational content methodologist. Convert each supplied ExerciseTemplate into exactly one SkillTemplate, preserving the supplied order. Treat the ExerciseTemplate title, text, and solution as authoritative. The two concrete exercises in q must be variations of that ExerciseTemplate: they must train the same ability mode and differ only in task data or parameters. The two exercises must have different concrete input parameters and must not contain identical questions. Change every input value needed to make the second task genuinely distinct while preserving the method and difficulty. Do not use BookSkills as generation input, merge ExerciseTemplates, or invent a different target skill. Keep the difficulty within the learner's Zone of Proximal Development. Return exactly one SkillTemplate per supplied ExerciseTemplate.

Use the natural language of each ExerciseTemplate for the complete corresponding SkillTemplate. This includes the heading, every exercise question, and every answer or worked solution. The supplied bookSkillId is only a storage relationship and must not affect or appear in the generated content.

${skillTemplateGenerationInstructions}`;

export const fixSkillTemplatesPrompt = 'Repair every supplied skill template without changing its target skill or language. Correct factual, mathematical, logical, JSON, and answer errors. Make each question self-contained and ensure every solution answers its question. The two exercises in every template must have different concrete input parameters and must not contain identical questions; revise the second exercise and its answer when necessary while preserving the same method and difficulty. Preserve the number and order of templates. Preserve the required i, t, h, and q structure. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Return only the corrected JSON array without markdown fences or commentary.';
