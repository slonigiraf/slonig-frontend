// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const QR_CODE_SIZE = 300;
export const sessionPrefix = 'knowledge';

export const exerciseAbilityModes = ['perceptual observation', 'perceptual discrimination', 'transformation', 'reasoning', 'generation'] as const;

export const OPENAI_MODELS = [
  { text: 'GPT-4o mini: $0.15/$0.60', value: 'openai/gpt-4o-mini' },
  { text: 'GPT-4o: $2.50/$10', value: 'openai/gpt-4o' },
  { text: 'GPT-4.1 mini: $0.40/$1.60', value: 'openai/gpt-4.1-mini' },
  { text: 'GPT-4.1: $2/$8', value: 'openai/gpt-4.1' },
  { text: 'GPT-5 mini: $0.25/$2', value: 'openai/gpt-5-mini' },
  { text: 'GPT-5: $1.25/$10', value: 'openai/gpt-5' },
  { text: 'GPT-5.4: $2.50/$15', value: 'openai/gpt-5.4' }
];

export const BOOK_PAGE_EXTRACTION_PROMPT = `On the provided page, identify the chapter and subchapter/section.

Extract only the concepts that are intentionally introduced or explained as new on this page. Do not include concepts that the page assumes the reader already knows, merely reviews, references from earlier sections, or uses only in exercises/examples without introducing them. Also extract every exercise, question, or problem the learner is asked to solve. Classify the primary ability trained by each exercise as exactly one of: "perceptual observation", "perceptual discrimination", "transformation", "reasoning", or "generation".

Return only valid JSON in this exact shape, keeping the original language of the input:
{"chapter":"Chapter and section name","concepts":[{"title":"New concept","description":"Explanation or example from the page"}],"exercises":[{"title":"Exercise title","description":"Complete exercise question or instructions","abilityMode":"reasoning","solution":"Complete step-by-step solution","imageIndexes":[],"imageDescription":"","solutionImageDescription":""}]}

Exercise records must never contain image bytes, image URLs, filenames, or Markdown image syntax. imageIndexes are extraction-only pointers that let the validator inspect attached source images; they are discarded before the Exercise is stored. imageDescription and solutionImageDescription are the only persisted visual-description fields.

Prefer a text-only Exercise whenever the same learner task and learning objective can be preserved without a visual. If an attached picture is merely decorative, illustrative, motivational, or repeats information already available in the text, set imageIndexes:[] and imageDescription:"". Do not invent a visual dependency. Use a nonempty imageDescription only when the learner must actually inspect visual, spatial, geometric, diagrammatic, graphical, or comparison information and stating that information in the text would change the task or reveal what the learner is supposed to infer. For those truly image-dependent exercises, include every required attached image index and write one complete standalone imageDescription that is sufficient to regenerate the task-essential visual later. The description must specify all labels, shapes, values, relationships, layout, and other visible information needed by the learner, but must not reveal the answer. Independently, set solutionImageDescription to a complete standalone description of the CORRECT worked-solution visual only when solving the exercise genuinely requires a drawing, construction, plot, graph, completed or modified diagram, marked image, or other visual result whose essential spatial information cannot be adequately represented by text. It may reveal answer information. If the task modifies the question visual, describe the complete correct updated version of that same visual while preserving unchanged details. Otherwise set solutionImageDescription:""; never add an optional or decorative solution illustration.

Use an empty string when the chapter is not shown. Use empty arrays when no concepts or exercises are present. The exercise description must contain the entire exercise statement, all textual data, and every instruction required to solve it except information intentionally supplied by a crucial visual; never abbreviate it or refer to an omitted source. If the book page provides a solution, extract its complete method and answer faithfully. Otherwise, solve the exercise and generate a correct, explicit step-by-step solution in the book's language. Never leave solution empty. Use <kx>...</kx> to surround KaTeX for every mathematical formula or expression in descriptions and solutions, never dollar-delimited LaTeX. Escape every backslash in mathematical notation so the result remains valid JSON. Do not add markdown or any text outside the JSON.`;

export const EXERCISE_TEMPLATE_STYLE_PROMPT = `Write every generated exercise as the short concrete instance of a reusable template pattern. Include only enough concrete variable context so the same wording pattern can later be reused by changing 1-3 data-bearing words or values while keeping the instruction, operation, structure, input/output types, and solution method unchanged. Make those replaceable data slots obvious from the concrete wording. This is a structural requirement only: do not generate, propose, compare, or output extra alternate or variant exercises to demonstrate the pattern; output only the exercise or exercises explicitly required by the calling prompt.

Aim for fewer words in the task and in the answer when the language and subject permit, while still makes sure to include steps by step instructions to solve the exercise. Templatability, self-containment, and an unambiguous learner operation take priority over the word target.`;

export const GENERATE_EXERCISES_PROMPT = (bookDetectedLanguage: string): string => `For every supplied concept, generate exactly one complete exercise using ${bookDetectedLanguage} language. Prefer abilityMode "transformation" whenever the concept can naturally be trained by transforming, applying, calculating, rewriting, constructing, converting, rearranging, or otherwise changing supplied information into an output. Use another abilityMode only when transformation would be unnatural or would change the learning target. abilityMode must be one of: ${exerciseAbilityModes.join(', ')}.

${EXERCISE_TEMPLATE_STYLE_PROMPT}

Design each Exercise completely in this single generation pass. Compose the task text, solution, and any necessary question/solution visual descriptions together as one coherent final artifact. Do not draft a text-only exercise first and rely on a later visual audit, correction, or retrofit; no second visual-design pass will run. Before returning each Exercise, internally verify that the wording and visual requirements agree and that any required visual description is already final.

Visuals are exceptional, not a default part of an Exercise. Prefer a fully self-contained text-only Exercise (including formulas when needed). For each generated Exercise, default both imageDescription and solutionImageDescription to absent or an empty string. A nonempty visual description is allowed only when it is genuinely necessary for the learner task or required answer. Do not add a visual because it would be helpful, attractive, merely illustrative, conventional for the topic, or useful as an optional explanation.

Use a nonempty imageDescription only when the learner MUST inspect visual, spatial, geometric, diagrammatic, graphical, visual-comparison, or other visual information and putting the same information into the text would materially change the learner operation or reveal what the learner is supposed to infer. If the task can be solved from the written description and formulas without inspecting an image, leave imageDescription empty. In the exceptional required-visual case, imageDescription must be a complete standalone generation prompt describing exactly the educational visual the learner must inspect, without the answer and without referring to a source page or unseen figure.

Use a nonempty solutionImageDescription only when the requested answer itself is inherently visual or the learner must create, draw, sketch, plot, graph, construct, mark, label, shade, transform, complete, or otherwise modify a visual artifact. A visual that merely demonstrates or illustrates a solution is NOT enough. If the complete correct answer can be expressed in text/formulas without losing essential spatial answer information, leave solutionImageDescription empty. In a genuinely required case, solutionImageDescription must be a complete standalone image-generation description of the CORRECT finished visual, including answer-bearing geometry, coordinates, labels, marks, lines, regions, transformations, and spatial relationships.

If the answer modifies a required question visual, describe the completed correct version of that same visual and preserve all unchanged objects, labels, scale, coordinate system, and layout. Never create a question or solution visual solely to make an Exercise more engaging or easier to understand.

Use <kx>...</kx> to surround every mathematical expression that uses KaTeX. Copy conceptIndex. Return only JSON: {"exercises":[{"conceptIndex":0,"title":"...","description":"complete task","abilityMode":"transformation","solution":"concise correct solution","imageDescription":"","solutionImageDescription":""}]}`;

export const STRICT_JSON_ARRAY_SYSTEM_PROMPT = 'Respond strictly as a JSON array.';

export const BOOK_PAGE_EXTRACTION_REQUEST_PROMPT = (text: string, imageNames: string[]): string => {
  return `${BOOK_PAGE_EXTRACTION_PROMPT}

The following text and ${imageNames.length} attached image(s) were extracted from the Mathpix MMD ZIP. Attached images are ordered from imageIndex 0 upward. Filename mapping: ${imageNames.map((name, index) => `${index}=${name}`).join(', ') || 'none'}. If the MMD contains Markdown such as ![](./images/file.jpg), use the filename mapping only to inspect the correct attached source image; do not copy that Markdown reference into the stored Exercise.

${text}`;
};

export const BOOK_LANGUAGE_DETECTION_PROMPT = (pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Identify the primary natural language of this book using only the supplied Mathpix MMD text from its middle pages. Ignore formulas, code, proper names, citations, isolated foreign phrases, and bilingual glossary fragments when deciding the main prose language. If the pages contain multiple languages, choose the language used for the majority of explanatory or instructional prose.

Return only valid JSON in this exact shape using a lowercase ISO 639-1 two-letter code:
{"language":"en"}

Middle-page MMD text:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};

export const GENERATE_EXERCISES_REQUEST_PROMPT = (bookDetectedLanguage: string, input: unknown): string => {
  return `${GENERATE_EXERCISES_PROMPT(bookDetectedLanguage)}\n${JSON.stringify(input)}`;
};

export const GENERATE_EXERCISES_RECOVERY_PROMPT = (bookDetectedLanguage: string, input: unknown, retry: number, maxRetries: number): string => {
  return `${GENERATE_EXERCISES_PROMPT(bookDetectedLanguage)}
This is recovery attempt ${retry} of ${maxRetries}. Generate exactly one exercise only for every supplied concept that still has no exercise.
${JSON.stringify(input)}`;
};

export const COURSE_NAMES_PROMPT = (input: unknown): string => {
  return `Correct and improve the book name and each editable chapter name using only the ordered skill-template titles as evidence. Keep names concise, specific, and in the same language as the skill-template titles. Do not translate. Return exactly this JSON shape and no commentary: {"bookName":"Name","chapters":[{"id":1,"title":"Chapter name"}]}. Return one chapter entry for every supplied editable chapter ID.

${JSON.stringify(input)}`;
};

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

export const ABILITY_GENERATION_INSTRUCTIONS_PROMPT = `A mental function is an abstraction describing a real human skill: one precisely stated ability a person can demonstrate by performing a task. Define it narrowly enough that the kind of input, expected output, and method are unambiguous. Name the learner's actual ability in h so the title explains what the learner can learn and do from these exercises. Do not use generic headings such as "Expected results", "Results", "Practice", or "Exercise". A broad topic such as "metric conversion" or "grammar" is not a sufficiently specific skill.

For each skill, plan one exercise template internally, then choose exactly two different sets of concrete parameters and fill them in to produce the two exercises in q. Both exercises must train the same skill and have identical instructions, wording, task structure, input and output types, operation or classification rule, conversion direction, solution method, number of reasoning steps, and difficulty. Only task data, such as numbers, names, words, or the sentence being analyzed, and the corresponding answer values may change. Avoid values that introduce an extra step, special case, or different strategy.

${EXERCISE_TEMPLATE_STYLE_PROMPT}

Require the learner to perform the skill and produce an answer independently. Every question h must contain the real question or task, with all concrete input data and instructions. Every answer a must contain the real answer or worked solution to that exact question, never a vague sentence such as "use the method" or "the expected result is...". Do not generate yes/no, true/false, multiple-choice, or choose-from-a-list questions. Avoid trivial recognition, merely naming the concept described in the question, repeating a supplied fact, or questions whose wording already reveals the answer. Changing a chemical symbol, name, or number in such a question does not make it useful practice. Adding "explain why" to an obvious yes/no question is not an adequate fix; redesign the task so the learner must calculate, construct, transform, or apply the concept to concrete data. A short numeric, symbolic, or textual answer is fine when obtaining it requires performing the target skill. Keep the work appropriate to the learner and the narrow skill; do not add unrelated steps or advanced concepts just to make it harder.

Positive example: "Convert 2 km to m." and "Convert 5 km to m." both train conversion from kilometers to meters by multiplying by 1000. Negative example: converting km to m in one exercise and m to km in the other trains two different skills and must not be one pair. Operators, conversion units and direction, and the required reasoning stay fixed; they are not parameters to vary.

Chemistry example: reject "Is there ionization when Na loses one electron? (Yes/No)". For the skill "Determine an ion's charge from electron loss", a suitable pair is "A neutral Na atom has 11 protons and loses one electron. Determine how many electrons remain and calculate the ion's charge using the proton and electron counts." and "A neutral K atom has 19 protons and loses one electron. Determine how many electrons remain and calculate the ion's charge using the proton and electron counts." The respective solutions are "Initially 11 electrons; 11 - 1 = 10 remain. Charge in elementary-charge units: 11 - 10 = +1, so the ion is Na+." and "Initially 19 electrons; 19 - 1 = 18 remain. Charge in elementary-charge units: 19 - 18 = +1, so the ion is K+." The learner applies charge accounting instead of confirming a definition.

Nonmathematical example: 'Rewrite "They walk to school." in the simple past tense.' and 'Rewrite "They jump over puddles." in the simple past tense.' train the same sentence-transformation skill. The respective answers are 'They walked to school.' and 'They jumped over puddles.'. Keep the grammatical structure and transformation rule fixed while changing the sentence data. If classification is the target skill, require the learner to derive and justify the classification from the item's properties without presenting answer choices.

Provide a correct answer or concise worked solution in a for each exercise. Work out both answers using the same steps before responding. All questions and answers must be self-contained, original, appropriate to the supplied material, and written in the input language. Do not refer to an unseen image, diagram, source page, or previous exercise. Use <kx>...</kx> for mathematical notation where helpful, escaping every LaTeX backslash so the output remains valid JSON.

Preserve this existing JSON array format exactly: each skill has i, t, h, and q; i is an empty string and t is 3. Each q contains exactly two exercises, each with h, a, p, and i; p and i are empty strings. Return fully written exercises and answers, with all parameter values already substituted. Do not add fields or output the internal exercise template, parameter definitions, or unresolved placeholders. Return only valid JSON without markdown fences or commentary.

Example output:
${abilityGenerationExample}

Before responding, verify that each pair demonstrates the same narrow human skill, differs only in concrete parameter values, has distinct task inputs, and has correct answers obtained through the same method. Confirm that both exercises require the learner to produce an answer by performing the skill, with no yes/no, true/false, answer choices, or trivial recognition shortcuts. Revise any pair that fails these checks.`;

export const SKILL_LIST_PROMPT = `Identify the distinct human skills trained by the exercises in the supplied file or images. Split a broad skill into separate narrow skills whenever the required input/output mapping, method, direction, or task structure differs. Return one Ability for each narrow skill, ordered from easiest to hardest, with exactly two similar parameterized exercises per Ability.

${ABILITY_GENERATION_INSTRUCTIONS_PROMPT}`;


export const SOURCES_TO_SKILLS_PROMPT = `You are an educational content methodologist. Convert each supplied book concept or book exercise into exactly one smallest useful, narrow, observable skill. Preserve the source-item order and return one skill for every source item, even when two source items appear similar. Each skill must state an unambiguous input, operation, and expected output. Do not merge items, omit items, generate multiple skills for one item, use broad topic names, or invent unsupported material.

Formulate every skill title and description abstractly, using the subject's general terms and concepts. Describe the general input type, operation, and output type. Do not include, copy, or depend on specific examples, names, numbers, sentences, objects, or exercise parameters from the source.

The request supplies the book's ISO 639-1 language code. Write every generated skill title and description strictly in that language. A ru book must produce Russian skills and a tr book must produce Turkish skills. Never infer a different output language or default to English because these instructions and JSON field names are English. Keep formulas, symbols, and proper names unchanged where appropriate.

Return only valid JSON in this exact shape:
{"skills":[{"title":"Narrow observable skill","description":"What the learner can do, including the relevant method and expected output"}]}

Use <kx>...</kx> for every mathematical formula or mathematical expression. Do not use dollar-delimited LaTeX. Escape every LaTeX backslash for valid JSON. Do not add markdown fences or commentary.`;


export const SOURCES_TO_SKILLS_REQUEST_PROMPT = (language: string, sources: unknown[], expectedCount = sources.length): string => {
  return `${SOURCES_TO_SKILLS_PROMPT}
Return exactly ${expectedCount} skills.
${language}
${JSON.stringify(sources)}`;
};

export const SKILLS_GENERATION_SYSTEM_PROMPT = (language: string): string => {
  return `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas.`;
};

export const ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT = (language: string, chapterTitle: string): string => {
  return `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas. Return complete valid JSON in the exact shape requested by the current workflow stage. Every source Exercise in this request belongs to chapter ${chapterTitle}; do not use or combine context from another chapter.`;
};

// Kept as an alias for callers outside this source bundle that still import the
// pre-redesign name. The live pipeline uses ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT.
export const EXERCISE_ABILITIES_SYSTEM_PROMPT = ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT;

export const REPAIR_SYSTEM_PROMPT = (language: string): string => {
  return `Keep ISO language ${language}. Return only the requested JSON object.`;
};

export const EXERCISE_ABILITIES_PROMPT = (language: string, chapterTitle: string, exercises: unknown): string => {
  return `${ABILITY_GENERATION_INSTRUCTIONS_PROMPT}

Chapter: ${chapterTitle}
Every supplied Exercise in this request belongs to this chapter. Do not mix, merge, or infer skills across chapter boundaries.

Convert every supplied book Exercise you can into exactly one Ability. Treat each source Exercise as evidence for one narrow human skill. Do not merge exercises or generate more than one Ability for a source Exercise. Use the source task and solution to identify the skill, then create the required pair of concrete practice exercises for that same skill. Write strictly in ISO language ${language}.

An Exercise never contains image bytes. imageDescription describes task-essential visual INPUT, while solutionImageDescription describes a required worked-solution visual OUTPUT. If imageDescription is empty, every imagePrompts.p value must stay empty and no question image may be invented. If imageDescription is nonempty, preserve the visual reasoning requirement without giving the visual information away in the question text. Write a complete standalone question-image prompt in imagePrompts.p for each Ability question that requires the visual, adapting concrete parameters so both questions still train the same skill. If solutionImageDescription is nonempty, every Ability question must receive a nonempty imagePrompts.i adapted to that question's concrete parameters and correct answer. Use solutionImageDescription as the structural/semantic source for the solution visual; do not blindly copy source values that were changed in the Ability variation. If solutionImageDescription is empty, imagePrompts.i should normally stay empty unless changesImage:true requires the completed version of the starting visual.

For EACH Ability question you MUST explicitly decide changesImage:true or changesImage:false. Set changesImage:true when the learner is asked to CHANGE, MODIFY, COMPLETE, EDIT, DRAW ON, MARK, LABEL, SHADE, COLOR, CONNECT, MOVE, ROTATE, REFLECT, RESIZE, REARRANGE, CORRECT, ADD TO, REMOVE FROM, or otherwise produce an UPDATED VERSION of the question visual. Examples include drawing a missing line on a diagram, shading a requested region, plotting a point on the shown graph, labeling parts of the shown image, moving/rotating a shown shape, completing a chart/table/number line, circling or crossing out objects, or correcting a visual. Merely looking at a visual and replying with text/number is changesImage:false. A request to create a new drawing from text, with no question visual being changed, is also changesImage:false.

Whenever changesImage:true, imagePrompts.p must describe the starting visual and imagePrompts.i must describe the COMPLETE CORRECT UPDATED VERSION OF THAT SAME VISUAL after applying the requested change. Preserve the same base objects, labels, coordinate system, scale, layout, and unchanged details; only make the changes required by the question. Never omit imagePrompts.i for changesImage:true. When source.solutionImageDescription is nonempty, it is an explicit requirement for a worked-solution image: adapt it into imagePrompts.i for both Ability questions, whether changesImage is true or false. When it is empty and changesImage is false, leave imagePrompts.i empty. Never create decorative, motivational, merely illustrative, or optional images. The nested Ability q[].p and q[].i fields themselves must remain empty strings at this stage; the browser materializes permitted visuals after validating the JSON.

For this Exercise-to-Ability conversion request only, wrap each completed Ability with the source Exercise id and imagePrompts. This transport wrapper overrides the bare-array transport format above; the nested Ability object itself must still contain only i, t, h, and q exactly as specified above. Return only valid JSON in this shape:
{"abilities":[{"exerciseId":123,"ability":{"i":"","t":3,"h":"Narrow observable skill","q":[{"h":"Question 1","a":"Answer 1","p":"","i":""},{"h":"Question 2","a":"Answer 2","p":"","i":""}]},"imagePrompts":[{"changesImage":false,"p":"","i":""},{"changesImage":true,"p":"Starting visual...","i":"Same visual after the required correct change..."}]}]}
Use only ids present in the supplied Exercises. Preserve their order. Prefer converting every Exercise, but if the response cannot fit all conversions, return every complete conversion you can and omit the rest rather than truncating or corrupting an Ability. Omitted Exercises will be retried automatically.

${JSON.stringify({ bookLanguage: language, chapterTitle, exercises })}`;
};

export const SINGLE_EXERCISE_ABILITY_RECOVERY_PROMPT = (language: string, chapterTitle: string, exerciseId: number | undefined, exercise: unknown): string => {
  return `Chapter: ${chapterTitle}
This Exercise belongs only to this chapter. Do not use context from any other chapter.

Convert this one book Exercise into exactly one valid Ability in ISO language ${language}. Infer one narrow observable skill from the source task and solution. Then write exactly two complete, self-contained practice questions that train that same skill with the same instructions, operation, method, input/output types, reasoning steps, and difficulty. Change only concrete task parameters and recalculate each answer. The two questions must not be identical. Do not use yes/no, multiple choice, placeholders, or references to the source page. Use <kx>...</kx> for mathematical expressions.

${EXERCISE_TEMPLATE_STYLE_PROMPT}

The Ability schema is strict: i must be "", t must be 3, h must be a nonempty skill name, q must contain exactly two objects, and every q object must contain nonempty h and a plus empty-string p and i fields.

If source.imageDescription is empty, both imagePrompts.p values must be empty. For EACH question, imagePrompts must contain changesImage:true or false. changesImage is true exactly when the learner must modify/update the provided question visual (for example add/remove/mark/label/shade/color/connect/move/rotate/reflect/rearrange/correct/complete something on it), not when the learner only inspects the visual and answers in text. If source.imageDescription is empty, changesImage must be false. Whenever changesImage is true, imagePrompts.i MUST describe the complete correct updated version of the SAME starting visual, preserving unchanged objects/layout and applying the requested change. If source.solutionImageDescription is nonempty, both imagePrompts.i values MUST also be nonempty and must adapt that source solution-visual description to each Ability question's concrete parameters and correct answer. If source.solutionImageDescription is empty and changesImage is false, imagePrompts.i must be empty. q[].p and q[].i must still remain empty.

Return only this JSON object and nothing else:
{"abilities":[{"exerciseId":${exerciseId},"ability":{"i":"","t":3,"h":"Narrow observable skill","q":[{"h":"Question 1","a":"Answer 1","p":"","i":""},{"h":"Question 2","a":"Answer 2","p":"","i":""}]},"imagePrompts":[{"changesImage":false,"p":"","i":""},{"changesImage":false,"p":"","i":""}]}]}

Source Exercise:
${JSON.stringify(exercise)}`;
};

export const FIX_ABILITIES_REQUEST_PROMPT = (input: unknown): string => {
  return `${FIX_ABILITIES_PROMPT}\n${JSON.stringify(input)}`;
};

export const FIX_EXERCISES_REQUEST_PROMPT = (input: unknown): string => {
  return `${FIX_EXERCISES_PROMPT}\n${JSON.stringify(input)}`;
};

export const JSON_VALIDATION_PROMPT = (originalRequest: string, candidate: string, validationError = ''): string => {
  return `Act as an independent strict validator. Check the candidate against every original requirement and the supplied input. Fix every factual, structural, language, completeness, ordering, KaTeX, and count error. If it cannot be repaired safely, regenerate the complete output from the original request. Return only the final corrected output in the exact originally requested JSON shape, without commentary.${validationError ? `\n\nThe application rejected the candidate for this exact reason. You MUST correct this failure as well as any other issue:\n${validationError}` : ''}

ORIGINAL REQUEST:
${originalRequest}

CANDIDATE OUTPUT:
${candidate}`;
};

export const ABILITY_QUESTION_IMAGE_PROMPT = (imageDescription: string, question: string): string => {
  return imageDescription
    ? `${imageDescription}
Create the task-essential STARTING visual for this concrete Ability question: ${question}. Preserve the educational structure, vary only the concrete task parameters, and do not reveal the answer in the visual.`
    : '';
};

export const ABILITY_SOLUTION_IMAGE_PROMPT = (solutionImageDescription: string, question: string, answer: string, additionalSpecification = ''): string => {
  return solutionImageDescription
    ? `${solutionImageDescription}
Use the source description as the required visual structure, but adapt all concrete values, labels, geometry, plotted data, markings, and answer details to this Ability variation. The image must show the complete correct worked-solution result for the question below and must not retain source-Exercise values that conflict with it.

Ability question:
${question}

Correct answer / worked solution:
${answer}${additionalSpecification ? `

Additional solution-visual specification from the Ability generator:
${additionalSpecification}` : ''}`
    : '';
};

export const ABILITY_CHANGED_IMAGE_SOLUTION_PROMPT = (questionImagePrompt: string, question: string, answer: string, sourceSolutionDescription = '', additionalSpecification = ''): string => {
  return `Create the COMPLETE CORRECT UPDATED VERSION of the SAME visual used in the question. Recreate the same base objects, labels, coordinate system, dimensions, scale, layout, and all unchanged details, then apply only the modification requested by the Ability question. The final image must visibly contain the answer/result, not merely explain it.

Starting question visual specification:
${questionImagePrompt}

Ability question:
${question}

Correct answer / worked solution:
${answer}${sourceSolutionDescription ? `

Required solution-visual specification from the source Exercise:
${sourceSolutionDescription}` : ''}${additionalSpecification ? `

Additional solution-visual specification from the Ability generator:
${additionalSpecification}` : ''}`;
};

export const OPEN_ROUTER_SVG_PROMPT = (visualPrompt: string, purpose: 'question' | 'solution'): string => {
  return `Decide whether this educational Ability visual can be represented faithfully as a clean vector SVG. Prefer SVG for diagrams, geometry, graphs, charts, tables, symbols, simple objects, maps, layouts, and other task visuals whose educational information is shape/text/position/relationship based. Choose raster only when the task genuinely depends on photographic realism, natural texture, subtle material appearance, complex real-world imagery, or another property that SVG would materially lose. Never choose raster merely for aesthetics.

If SVG is suitable, create a complete standalone SVG that exactly represents the requested task-essential visual. Keep it simple and readable, include only information required by the task, ${purpose === 'solution' ? 'this is a worked-solution visual, so show the complete correct constructed/drawn/plotted/modified result requested by the prompt and do not suppress answer information that the solution itself must display; when the task changes a question visual, preserve the same base objects, labels, scale, coordinate system, and layout and apply only the requested changes' : 'this is a question visual, so do not reveal or encode the answer'}, use a viewBox, and do not use scripts, external resources, embedded raster images, foreignObject, URLs, or event handlers. If SVG would break the educational logic, choose raster.

Return only JSON: {"format":"svg","svg":"<svg ...>...</svg>"} or {"format":"raster","svg":""}.

Visual request:
${visualPrompt}`;
};

export const OPEN_ROUTER_SOLUTION_RASTER_PROMPT = (visualPrompt: string): string => {
  return `Create the complete worked-solution visual. Show the correct constructed, drawn, labeled, shaded, plotted, graphed, marked, or modified result required by the solution. If this is an updated version of a question visual, preserve all unchanged base objects, labels, scale, coordinate system, and layout and apply only the requested change.

${visualPrompt}`;
};

export const FIX_ABILITIES_PROMPT = `Review every supplied Ability in this chapter and identify any error: factual, mathematical, logical, grammatical, spelling, ambiguity, incomplete or non-self-contained questions, incorrect or mismatched answers, mismatch between the two exercises and the target Skill, identical questions or concrete parameters, JSON/schema problems, and KaTeX syntax, escaping, or formula errors. The input contains every Ability from one chapter, each with its real stored id and chapter-local index; an Ability may be a parsed JSON object or a raw JSON string when its stored JSON is malformed. Also compare all supplied Abilities against one another and find duplicate Abilities within this chapter. A duplicate means two records represent the same Ability with the same narrow skill and the same or materially identical concrete question/answer content; do not call records duplicates merely because they train the same Skill with genuinely different concrete inputs. For every duplicate record, return an explicit duplicatePairs entry with both the canonical kept record id and the duplicate record id to delete: {"keptAbilityId":"stored-id-to-keep","deletedAbilityId":"stored-id-to-delete"}. For every duplicate set, keep the earliest supplied index as the canonical record. If three records are duplicates, return one pair for each later record, both pointing to the same earliest canonical record. Never invent an id or index that is not present in the supplied chapter. Never use a record marked for deletion as the kept record in another pair. Return reviews only for input indexes where you find an error. It is valid and preferred to omit correct Abilities entirely; a partial reviews array is expected. If there are no errors or duplicates return {"reviews":[],"duplicatePairs":[]}. For an erroneous Ability, list concise error descriptions and include the complete corrected Ability in ability: {"index":0,"hasErrors":true,"errors":["description"],"ability":{...}}. If you choose to include a correct Ability, use {"index":0,"hasErrors":false,"errors":[]}, but this is unnecessary. Do not repair an Ability whose record id you place in duplicatePairs as deletedAbilityId because that record will be deleted. Correct every other identified error while preserving the same target Skill, language, method, and difficulty. Treat non-atomic scope as an error: each Ability must exercise one stable input type, one learner operation, one output type, and one method/direction; do not combine independently practicable operations in one Ability. Make the minimum changes necessary. Keep learner-facing text compact: h should normally fit within 12 words, each q[].h within 32 words, and each q[].a within 38 words. Answers should contain only the result plus the minimum derivation needed to check the target operation, not tutorial prose or a restatement of the question. Every corrected Ability must preserve the required i, t, h, and q structure, with t=3 and exactly two q entries. The q[].p and q[].i linkage values may point to real question or solution images (or may temporarily contain locally generated image data before publishing). The repair request can replace their bytes with "[question image present]" or "[answer image present]" placeholders so the prompt stays small. Treat those placeholders as real existing images: preserve the image dependency, never blank or repurpose image slots, and do not rewrite an image-based task into a text-only task that reveals the visual information. Do not change any existing i or p linkage values; the browser preserves the original image values locally. For malformed stored JSON, provide valid string values for i and p. The two exercises must train the same narrow skill but use different concrete input parameters. ${EXERCISE_TEMPLATE_STYLE_PROMPT} For Ability repair, use only the reusable-template and self-containment parts of that shared style; the compact answer limits above override its request for step-by-step solution prose. Apply it without changing the target skill. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Return only valid JSON in this exact top-level shape: {"reviews":[...],"duplicatePairs":[{"keptAbilityId":"stored-id-to-keep","deletedAbilityId":"stored-id-to-delete"}]}. Do not add markdown fences or commentary.`;

export const FIX_EXERCISES_PROMPT = `Review every supplied Exercise in this chapter and identify any error: factual, mathematical, logical, grammatical, spelling, ambiguity, incomplete or non-self-contained task text, incorrect or mismatched solution, inappropriate abilityMode, unnecessary or missing imageDescription or solutionImageDescription, JSON/schema problems, and KaTeX syntax, escaping, or formula errors. Exercise records contain no image bytes and no image links; imageDescription and solutionImageDescription are the only visual-description fields. Treat both as strict semantic requirements, not illustration requests. imageDescription describes visual INPUT the learner must inspect; solutionImageDescription describes a visual OUTPUT required by the correct worked solution. Prefer imageDescription:"" whenever the same learning objective and learner operation can be preserved with a self-contained text-only task. Clear imageDescription when a visual would be decorative, illustrative, motivational, redundant with text, or merely nice to have. Keep or create a nonempty imageDescription only when the learner must inspect visual, spatial, geometric, diagrammatic, graphical, or comparison information and writing that information into the task would change the skill or reveal what the learner must infer. In that exceptional case, imageDescription must be a complete standalone prompt sufficient to generate the task-essential visual later, including all required labels, shapes, values, relationships, and layout, but not the answer. Independently audit the EXPECTED ANSWER FORMAT of every Exercise before deciding it is correct. A missing solutionImageDescription is an error whenever the learner's requested answer or the worked solution includes, produces, completes, or modifies a drawing or visual artifact. This includes tasks that ask the learner to draw, sketch, plot, graph, construct, trace, complete, mark, label, annotate, shade, color, connect, move, rotate, reflect, translate, rearrange, correct, or otherwise alter a figure, coordinate plane, number line, diagram, chart, table, map, geometric construction, model, or visual representation. It is also required when the solution steps themselves perform one of those visual actions, even if a numeric or textual answer can additionally be stated. Do not treat a textual statement of the answer as a substitute for the required visual output. solutionImageDescription must completely describe the CORRECT finished solution visual and may reveal the answer. If the learner modifies the question visual, it must describe the completed correct version of that same visual while preserving unchanged objects, labels, scale, coordinate system, and layout. REMOVAL RULE: an existing nonempty solutionImageDescription is not proof that a solution image is required. Clear it when this answer-format audit shows the requested answer and worked method are fully representable in text/formulas and no drawing, plotting, construction, marking, or visual modification is required. Preserve or correct it only when a visual output is genuinely required. For an Exercise whose existing solutionImageDescription is empty, create one only when this answer-format audit says a visual output is required. Do not generate or return image bytes, URLs, filenames, imageIndexes, image, or images. The input contains every Exercise from one chapter, each with its real stored numeric id, conceptId, and chapter-local index. Also compare all supplied Exercises against one another and find duplicate Exercises within this chapter. When a conceptId has more than one Exercise, prefer retaining the single Exercise that requires the most learner thinking and information transformation, and propose weaker or redundant same-concept Exercises for deletion in duplicatePairs. Prefer a task that makes the learner transform, apply, infer, calculate, compare, construct, or solve from supplied information over a task that merely asks the learner to explain, describe, define, restate, recognize, or repeat information. Judge the actual task, not only its abilityMode label. If candidates require similar kinds of thinking, prefer the one with more meaningful reasoning or transformation steps; use the earliest supplied index only as a final tie-breaker. This is a preference rather than an absolute cardinality rule: do not force deletion solely to reach exactly one Exercise if multiple same-concept Exercises meaningfully require distinct transformations, reasoning paths, or outputs, or if you are not confident they are redundant. Treat records as duplicates when they are redundant for the concept or have the same or materially identical task, inputs, required method, and solution. For every record proposed for deletion, return an explicit duplicatePairs entry with both the selected kept record id and the record id to delete: {"keptExerciseId":1,"deletedExerciseId":2}. When deleting multiple same-concept Exercises in favor of one stronger Exercise, point those deletions to that same selected Exercise. Never invent an id or index that is not present in the supplied chapter. Never use a record marked for deletion as the kept record in another pair. Return reviews only for input indexes where you find an error. It is valid and preferred to omit correct Exercises entirely; a partial reviews array is expected. If there are no errors or duplicates return {"reviews":[],"duplicatePairs":[]}. For an erroneous Exercise, list concise error descriptions and include the complete corrected editable Exercise fields in exercise: {"index":0,"hasErrors":true,"errors":["description"],"exercise":{"title":"...","description":"...","abilityMode":"reasoning","solution":"...","imageDescription":"","solutionImageDescription":""}}. If you choose to include a correct Exercise, use {"index":0,"hasErrors":false,"errors":[]}, but this is unnecessary. Do not repair an Exercise whose record id you place in duplicatePairs as deletedExerciseId because that record will be deleted. Correct every other identified error while preserving the same learning target, language, method, scope, source meaning, and difficulty. Make the minimum changes necessary. abilityMode must be exactly one of: perceptual observation, perceptual discrimination, transformation, reasoning, generation. The corrected task and solution must be complete and self-contained except for information intentionally delegated to a genuinely crucial question visual described by imageDescription; solutionImageDescription may separately specify a required visual form of the worked result. ${EXERCISE_TEMPLATE_STYLE_PROMPT} Apply this style when rewriting generated Exercise description and solution; preserve source-book wording when fidelity requires it. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Do not return or change database identity or relationship fields such as id, bookPage, conceptId, chapterId, or source; the browser preserves them locally. Return only valid JSON in this exact top-level shape: {"reviews":[...],"duplicatePairs":[{"keptExerciseId":1,"deletedExerciseId":2}]}. Do not add markdown fences or commentary.`;
