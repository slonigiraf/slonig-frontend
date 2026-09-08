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

const abilityGenerationExample = String.raw`[
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

export const abilityGenerationInstructions = `A mental function is an abstraction describing a real human skill: one precisely stated ability a person can demonstrate by performing a task. Define it narrowly enough that the kind of input, expected output, and method are unambiguous. Name the learner's actual ability in h so the title explains what the learner can learn and do from these exercises. Do not use generic headings such as "Expected results", "Results", "Practice", or "Exercise". A broad topic such as "metric conversion" or "grammar" is not a sufficiently specific skill.

For each skill, plan one exercise template internally, then choose exactly two different sets of concrete parameters and fill them in to produce the two exercises in q. Both exercises must train the same skill and have identical instructions, wording, task structure, input and output types, operation or classification rule, conversion direction, solution method, number of reasoning steps, and difficulty. Only task data, such as numbers, names, words, or the sentence being analyzed, and the corresponding answer values may change. Avoid values that introduce an extra step, special case, or different strategy.

Require the learner to perform the skill and produce an answer independently. Every question h must contain the real question or task, with all concrete input data and instructions. Every answer a must contain the real answer or worked solution to that exact question, never a vague sentence such as "use the method" or "the expected result is...". Do not generate yes/no, true/false, multiple-choice, or choose-from-a-list questions. Avoid trivial recognition, merely naming the concept described in the question, repeating a supplied fact, or questions whose wording already reveals the answer. Changing a chemical symbol, name, or number in such a question does not make it useful practice. Adding "explain why" to an obvious yes/no question is not an adequate fix; redesign the task so the learner must calculate, construct, transform, or apply the concept to concrete data. A short numeric, symbolic, or textual answer is fine when obtaining it requires performing the target skill. Keep the work appropriate to the learner and the narrow skill; do not add unrelated steps or advanced concepts just to make it harder.

Positive example: "Convert 2 km to m." and "Convert 5 km to m." both train conversion from kilometers to meters by multiplying by 1000. Negative example: converting km to m in one exercise and m to km in the other trains two different skills and must not be one pair. Operators, conversion units and direction, and the required reasoning stay fixed; they are not parameters to vary.

Chemistry example: reject "Is there ionization when Na loses one electron? (Yes/No)". For the skill "Determine an ion's charge from electron loss", a suitable pair is "A neutral Na atom has 11 protons and loses one electron. Determine how many electrons remain and calculate the ion's charge using the proton and electron counts." and "A neutral K atom has 19 protons and loses one electron. Determine how many electrons remain and calculate the ion's charge using the proton and electron counts." The respective solutions are "Initially 11 electrons; 11 - 1 = 10 remain. Charge in elementary-charge units: 11 - 10 = +1, so the ion is Na+." and "Initially 19 electrons; 19 - 1 = 18 remain. Charge in elementary-charge units: 19 - 18 = +1, so the ion is K+." The learner applies charge accounting instead of confirming a definition.

Nonmathematical example: 'Rewrite "They walk to school." in the simple past tense.' and 'Rewrite "They jump over puddles." in the simple past tense.' train the same sentence-transformation skill. The respective answers are 'They walked to school.' and 'They jumped over puddles.'. Keep the grammatical structure and transformation rule fixed while changing the sentence data. If classification is the target skill, require the learner to derive and justify the classification from the item's properties without presenting answer choices.

Provide a correct answer or concise worked solution in a for each exercise. Work out both answers using the same steps before responding. All questions and answers must be self-contained, original, appropriate to the supplied material, and written in the input language. Do not refer to an unseen image, diagram, source page, or previous exercise. Use <kx>...</kx> for mathematical notation where helpful, escaping every LaTeX backslash so the output remains valid JSON.

Preserve this existing JSON array format exactly: each skill has i, t, h, and q; i is an empty string and t is 3. Each q contains exactly two exercises, each with h, a, p, and i; p and i are empty strings. Return fully written exercises and answers, with all parameter values already substituted. Do not add fields or output the internal exercise template, parameter definitions, or unresolved placeholders. Return only valid JSON without markdown fences or commentary.

Example output:
${abilityGenerationExample}

Before responding, verify that each pair demonstrates the same narrow human skill, differs only in concrete parameter values, has distinct task inputs, and has correct answers obtained through the same method. Confirm that both exercises require the learner to produce an answer by performing the skill, with no yes/no, true/false, answer choices, or trivial recognition shortcuts. Revise any pair that fails these checks.`;

export const skillListPrompt = `Identify the distinct human skills trained by the exercises in the supplied file or images. Split a broad skill into separate narrow skills whenever the required input/output mapping, method, direction, or task structure differs. Return one Ability for each narrow skill, ordered from easiest to hardest, with exactly two similar parameterized exercises per Ability.

${abilityGenerationInstructions}`;

export const conceptsToSkillsPrompt = `You are an educational content methodologist. Convert the supplied concepts to Abilities one-to-one, preserving their order. For each concept, choose one specific human skill it supports, plan an exercise template internally, and generate exactly two concrete exercises from it. If a concept is broad, choose one representative narrow skill; do not combine different abilities in its two exercises. Keep the original language. Return one Ability for each concept in the existing JSON array format below.

${abilityGenerationInstructions}`;

export const sourcesToSkillsPrompt = `You are an educational content methodologist. Convert each supplied book concept or book exercise into exactly one smallest useful, narrow, observable skill. Preserve the source-item order and return one skill for every source item, even when two source items appear similar. Each skill must state an unambiguous input, operation, and expected output. Do not merge items, omit items, generate multiple skills for one item, use broad topic names, or invent unsupported material.

Formulate every skill title and description abstractly, using the subject's general terms and concepts. Describe the general input type, operation, and output type. Do not include, copy, or depend on specific examples, names, numbers, sentences, objects, or exercise parameters from the source.

The request supplies the book's ISO 639-1 language code. Write every generated skill title and description strictly in that language. A ru book must produce Russian skills and a tr book must produce Turkish skills. Never infer a different output language or default to English because these instructions and JSON field names are English. Keep formulas, symbols, and proper names unchanged where appropriate.

Return only valid JSON in this exact shape:
{"skills":[{"title":"Narrow observable skill","description":"What the learner can do, including the relevant method and expected output"}]}

Use <kx>...</kx> for every mathematical formula or mathematical expression. Do not use dollar-delimited LaTeX. Escape every LaTeX backslash for valid JSON. Do not add markdown fences or commentary.`;

export const skillsToExerciseTemplatesPrompt = `The input is a JSON object with a bookLanguage and blocks. Each block contains one skill
and all of its linked concepts and exampleExercises.
For each block, create exactly one exercise for ability mode transformation.
Return exactly one output exercise per skill. Every output exercise must train only its supplied skill.
Match the structure, terminology, tone, and difficulty of the linked book exercises without copying their exact parameters.
The text must be a succinct, complete, self-contained exercise.
The solution must be complete, correct, and written step by step.
Preserve the supplied skill block order. Do not mix concepts or exercises between blocks.
Write every text and solution strictly in bookLanguage.
Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX,
and escape every LaTeX backslash for valid JSON.
Return only valid JSON in this shape:
{"templates":[{"skillId":1,"text":"Complete exercise","solution":"Complete solution"}]}
Set skillId to the corresponding supplied skill.id; 1 above is only an example.

Do not add markdown fences or commentary.`;

export const divideExerciseTemplatesPrompt = `Review the supplied ExerciseTemplates grouped with their corresponding Skill. Do not change or return the parent ExerciseTemplates. For each parent whose solution has multiple substantive steps, create one additional, self-contained child ExerciseTemplate for every individual step. Each child must train that step alone, keep the parent's skillId, contain a succinct real task, and provide a correct step-by-step solution. Return no children for a parent that already has only one substantive step.

Preserve the book language. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON.

Return only valid JSON in this shape; an empty templates array is valid:
{"templates":[{"skillId":1,"text":"Self-contained exercise for one step","solution":"Step-by-step solution"}]}

Use only supplied skillId values. Do not repeat any parent unchanged. Do not add markdown fences or commentary.`;

export const skillsToExercisesPrompt = `The input is a JSON object containing bookLanguage, chapterTitle, and exerciseTemplates from one chapter. For every supplied ExerciseTemplate, create exactly one similar ExerciseTemplate variation and preserve the supplied order.

Vary the concrete arguments or task parameters in text while preserving the exact ability, instructions, task structure, input and output types, operation or classification rule, solution method, number of reasoning steps, and difficulty. The variation text must not be identical to the original. Recalculate the solution using the varied arguments; the variation solution must be correct for its new text and must not be identical to the original solution. Do not merge, omit, split, or reorder ExerciseTemplates.

Each variations item must correspond by array position to the ExerciseTemplate at the same position in the input. Do not copy database IDs into the response; the browser will retain those relationships locally. Write text and solution strictly in bookLanguage. Both must be complete and self-contained. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON.

Return only valid JSON in this exact shape:
{"variations":[{"text":"Complete varied exercise","solution":"Complete recalculated solution"}]}

Do not return Abilities, database IDs, markdown fences, or commentary. Abilities and their relationships are constructed locally in the browser.`;

export const fixAbilitiesPrompt = 'Review every supplied Ability in this chapter and identify any error: factual, mathematical, logical, grammatical, spelling, ambiguity, incomplete or non-self-contained questions, incorrect or mismatched answers, mismatch between the two exercises and the target Skill, identical questions or concrete parameters, JSON/schema problems, and KaTeX syntax, escaping, or formula errors. The input contains every Ability from one chapter, each with its real stored id and chapter-local index; an Ability may be a parsed JSON object or a raw JSON string when its stored JSON is malformed. Also compare all supplied Abilities against one another and find duplicate Abilities within this chapter. A duplicate means two records represent the same Ability with the same narrow skill and the same or materially identical concrete question/answer content; do not call records duplicates merely because they train the same Skill with genuinely different concrete inputs. For every duplicate record, return an explicit duplicatePairs entry with both the canonical kept record id and the duplicate record id to delete: {"keptAbilityId":"stored-id-to-keep","deletedAbilityId":"stored-id-to-delete"}. For every duplicate set, keep the earliest supplied index as the canonical record. If three records are duplicates, return one pair for each later record, both pointing to the same earliest canonical record. Never invent an id or index that is not present in the supplied chapter. Never use a record marked for deletion as the kept record in another pair. Return reviews only for input indexes where you find an error. It is valid and preferred to omit correct Abilities entirely; a partial reviews array is expected. If there are no errors or duplicates return {"reviews":[],"duplicatePairs":[]}. For an erroneous Ability, list concise error descriptions and include the complete corrected Ability in ability: {"index":0,"hasErrors":true,"errors":["description"],"ability":{...}}. If you choose to include a correct Ability, use {"index":0,"hasErrors":false,"errors":[]}, but this is unnecessary. Do not repair an Ability whose record id you place in duplicatePairs as deletedAbilityId because that record will be deleted. Correct every other identified error while preserving the same target Skill, language, method, and difficulty. Make the minimum changes necessary. Every corrected Ability must preserve the required i, t, h, and q structure, with t=3 and exactly two q entries. The q[].p and q[].i linkage values may point to real question or solution images (or may temporarily contain locally generated image data before publishing). The repair request can replace their bytes with "[question image present]" or "[answer image present]" placeholders so the prompt stays small. Treat those placeholders as real existing images: preserve the image dependency, never blank or repurpose image slots, and do not rewrite an image-based task into a text-only task that reveals the visual information. Do not change any existing i or p linkage values; the browser preserves the original image values locally. For malformed stored JSON, provide valid string values for i and p. The two exercises must train the same narrow skill but use different concrete input parameters. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Return only valid JSON in this exact top-level shape: {"reviews":[...],"duplicatePairs":[{"keptAbilityId":"stored-id-to-keep","deletedAbilityId":"stored-id-to-delete"}]}. Do not add markdown fences or commentary.';

export const fixExercisesPrompt = 'Review every supplied Exercise in this chapter and identify any error: factual, mathematical, logical, grammatical, spelling, ambiguity, incomplete or non-self-contained task text, incorrect or mismatched solution, inappropriate abilityMode, unnecessary or missing imageDescription, JSON/schema problems, and KaTeX syntax, escaping, or formula errors. Exercise records contain no image bytes and no image links; imageDescription is the only visual field. Treat imageDescription as a strict semantic requirement, not as an illustration request. Prefer imageDescription:"" whenever the same learning objective and learner operation can be preserved with a self-contained text-only task. Clear imageDescription when a visual would be decorative, illustrative, motivational, redundant with text, or merely nice to have. Keep or create a nonempty imageDescription only when the learner must inspect visual, spatial, geometric, diagrammatic, graphical, or comparison information and writing that information into the task would change the skill or reveal what the learner must infer. In that exceptional case, imageDescription must be a complete standalone prompt sufficient to generate the task-essential visual later, including all required labels, shapes, values, relationships, and layout, but not the answer. Do not generate or return image bytes, URLs, filenames, imageIndexes, image, or images. The input contains every Exercise from one chapter, each with its real stored numeric id, conceptId, and chapter-local index. Also compare all supplied Exercises against one another and find duplicate Exercises within this chapter. When a conceptId has more than one Exercise, prefer retaining the single Exercise that requires the most learner thinking and information transformation, and propose weaker or redundant same-concept Exercises for deletion in duplicatePairs. Prefer a task that makes the learner transform, apply, infer, calculate, compare, construct, or solve from supplied information over a task that merely asks the learner to explain, describe, define, restate, recognize, or repeat information. Judge the actual task, not only its abilityMode label. If candidates require similar kinds of thinking, prefer the one with more meaningful reasoning or transformation steps; use the earliest supplied index only as a final tie-breaker. This is a preference rather than an absolute cardinality rule: do not force deletion solely to reach exactly one Exercise if multiple same-concept Exercises meaningfully require distinct transformations, reasoning paths, or outputs, or if you are not confident they are redundant. Treat records as duplicates when they are redundant for the concept or have the same or materially identical task, inputs, required method, and solution. For every record proposed for deletion, return an explicit duplicatePairs entry with both the selected kept record id and the record id to delete: {"keptExerciseId":1,"deletedExerciseId":2}. When deleting multiple same-concept Exercises in favor of one stronger Exercise, point those deletions to that same selected Exercise. Never invent an id or index that is not present in the supplied chapter. Never use a record marked for deletion as the kept record in another pair. Return reviews only for input indexes where you find an error. It is valid and preferred to omit correct Exercises entirely; a partial reviews array is expected. If there are no errors or duplicates return {"reviews":[],"duplicatePairs":[]}. For an erroneous Exercise, list concise error descriptions and include the complete corrected editable Exercise fields in exercise: {"index":0,"hasErrors":true,"errors":["description"],"exercise":{"title":"...","description":"...","abilityMode":"reasoning","solution":"...","imageDescription":""}}. If you choose to include a correct Exercise, use {"index":0,"hasErrors":false,"errors":[]}, but this is unnecessary. Do not repair an Exercise whose record id you place in duplicatePairs as deletedExerciseId because that record will be deleted. Correct every other identified error while preserving the same learning target, language, method, scope, source meaning, and difficulty. Make the minimum changes necessary. abilityMode must be exactly one of: perceptual observation, perceptual discrimination, transformation, reasoning, generation. The corrected task and solution must be complete and self-contained except for information intentionally delegated to a genuinely crucial visual described by imageDescription. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Do not return or change database identity or relationship fields such as id, bookPage, conceptId, chapterId, or source; the browser preserves them locally. Return only valid JSON in this exact top-level shape: {"reviews":[...],"duplicatePairs":[{"keptExerciseId":1,"deletedExerciseId":2}]}. Do not add markdown fences or commentary.';
