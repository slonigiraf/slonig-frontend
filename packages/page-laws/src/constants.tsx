// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const QR_CODE_SIZE = 300;
export const sessionPrefix = 'knowledge';
export const MATHPIX_PDF_PAGE_PRICE_USD = 0.005;

export const OPENAI_MODELS = [
  { text: 'GPT-4o mini: $0.15/$0.60', value: 'openai/gpt-4o-mini' },
  { text: 'GPT-4o: $2.50/$10', value: 'openai/gpt-4o' },
  { text: 'GPT-4.1 mini: $0.40/$1.60', value: 'openai/gpt-4.1-mini' },
  { text: 'GPT-4.1: $2/$8', value: 'openai/gpt-4.1' },
  { text: 'GPT-5 mini: $0.25/$2', value: 'openai/gpt-5-mini' },
  { text: 'GPT-5: $1.25/$10', value: 'openai/gpt-5' },
  { text: 'GPT-5.4: $2.50/$15', value: 'openai/gpt-5.4' }
];

export const BOOK_CHAPTER_EXTRACTION_PROMPT = `Read the complete supplied chapter as one unit and extract only the distinct concepts that are intentionally introduced or explained as new anywhere in this chapter. Chapter assignment is already known; do not identify, infer, or return a different chapter or section.

Deduplicate concepts across the whole chapter. If the same concept is introduced, restated, expanded, exemplified, or referenced on multiple pages, return it exactly once. Set pageNumber to the earliest supplied page where that concept is actually introduced as new, not the page with the longest or clearest later explanation. Do not split one concept into duplicates merely because wording, notation, examples, or level of detail changes on later pages.

Do not include concepts that the chapter assumes the reader already knows, merely reviews, references from earlier chapters, or uses only in exercises/examples without introducing them. Ignore exercises, questions, problems, drills, review tasks, and their solutions completely: do not parse, solve, summarize, or return them.

Return only valid JSON in this exact shape, keeping the original language of the input:
{"concepts":[{"title":"New concept","description":"Explanation or example from the chapter","pageNumber":12}]}

Every pageNumber must be one of the supplied page numbers. Use an empty array when no new concepts are present. Keep each concept description focused on the explanation of the concept itself; do not turn an exercise statement into a concept description. Use <kx>...</kx> to surround KaTeX for every mathematical formula or expression, never dollar-delimited LaTeX. Escape every backslash in mathematical notation so the result remains valid JSON. Do not add markdown or any text outside the JSON.`;

// Compatibility alias for callers that still import the older name. Concept
// extraction itself is chapter-scoped; the request prompt below supplies all
// pages from one chapter together.
export const BOOK_PAGE_EXTRACTION_PROMPT = BOOK_CHAPTER_EXTRACTION_PROMPT;

export const EXERCISE_TEMPLATE_STYLE_PROMPT = `Write every generated exercise as the short concrete instance of a reusable template pattern. Include only enough concrete variable context so the same wording pattern can later be reused by changing 1-3 data-bearing words or values while keeping the instruction, operation, structure, input/output types, and solution method unchanged. Make those replaceable data slots obvious from the concrete wording. This is a structural requirement only: do not generate, propose, compare, or output extra alternate or variant exercises to demonstrate the pattern; output only the exercise or exercises explicitly required by the calling prompt.

Keep learner-facing task text short and direct. Do not include solution steps, construction details that disclose answer-bearing information, or tutorial prose in the question unless carrying out that procedure is itself the target skill. Keep the solution concise, but make the solving method visible whenever the answer is not immediately obvious. For a one-step or self-evident task, the result plus the direct substitution, rule application, or calculation is enough. For a non-obvious or multi-step task, include the essential steps in logical order, with the intermediate calculations, transformations, or reasons needed to understand how the final answer is reached. Do not skip a meaningful transition merely to shorten the solution, and do not add tutorial filler beyond the steps needed to solve the specific exercise. Templatability, self-containment, and an unambiguous learner operation take priority over the word target.`;

export const LEARNER_AGE_PROMPT = (learnerAge?: number): string => Number.isSafeInteger(learnerAge)
  ? `The current learner age is ${learnerAge} years. Keep vocabulary, sentence complexity, assumed background knowledge, cognitive load, examples, task difficulty, answer expectations, and any visual content appropriate for a ${learnerAge}-year-old learner. Preserve the intended learning target and required method; age-appropriateness must not simplify away the skill being taught or assessed.`
  : '';

const EXERCISE_QUESTION_BREVITY_PROMPT = `Make each Exercise description a succinct learner-facing question or command. Prefer one short sentence. Aim for about 6-16 words and normally no more than about 20 words; exceed that only when essential task data or constraints cannot be omitted without making the task ambiguous or incomplete. Remove scene-setting, repeated directions, procedural coaching, definitions, and facts already supplied by the concept or a required visual. If a question visual carries task data, refer to it briefly (for example, "the figure" or "the visual") instead of restating its contents. Brevity must never remove values, conditions, units, or other information the learner actually needs to answer.`;

export const GENERATE_EXERCISES_PROMPT = (bookDetectedLanguage: string, learnerAge?: number): string => `For every supplied concept, generate exactly one complete exercise using ${bookDetectedLanguage} language.

${LEARNER_AGE_PROMPT(learnerAge)}
Preserve the concept's learner modality: the generated task must exercise the same kind of input, operation, and output implied by the concept instead of replacing it with an easier textual surrogate. In particular, when interpreting, locating, constructing, completing, comparing, or otherwise using a representation is part of the target skill, keep that representational operation in the exercise rather than describing the procedure in prose.

${EXERCISE_TEMPLATE_STYLE_PROMPT}

${EXERCISE_QUESTION_BREVITY_PROMPT}

Design each Exercise completely in this single generation pass. Compose the task text, solution, and any necessary question/solution visual descriptions together as one coherent final artifact. Do not draft a text-only exercise first and rely on a later visual audit, correction, or retrofit; no second visual-design pass will run. Before returning each Exercise, internally verify that the wording and visual requirements agree and that any required visual description is already final.

Decide question and solution visuals from the learner's required input and output, not from the subject name. Use a nonempty imageDescription exactly when information needed to perform the target operation is intentionally encoded in a visual or spatial representation and moving that information into the text would change the operation or disclose what the learner is meant to determine. When imageDescription is used, keep answer-bearing visual facts there instead of duplicating them in the question text. imageDescription must be a complete standalone generation prompt for the required input visual, must omit the answer, and must not refer to a source page or unseen figure.

Use a nonempty solutionImageDescription exactly when the requested response itself has essential visual or spatial state, or when the learner must create, complete, mark, label, plot, draw, arrange, or otherwise modify a representation. If the task modifies a supplied visual, imageDescription describes the starting state and solutionImageDescription describes the correct finished state while preserving every unchanged object, label, scale, coordinate system, and layout. If a learner only reads or decodes a visual and returns a textual, numeric, or symbolic answer, do not add a solution image merely to illustrate that answer.

When neither the target input nor target output is representational, keep both visual-description fields empty. Never add a visual for decoration, engagement, convention, or optional explanation.

Preserve the task's represented form unless changing that form is explicitly the skill being tested. Do not silently simplify, normalize, canonicalize, convert, relabel, or replace an equivalent representation in the solution when the learner is being asked to read, identify, reproduce, or mark the representation as shown.

Derive the title from the learner operation and its input/output types rather than copying the concept heading. Keep the description focused on what the learner must do; let imageDescription carry any task-essential visual state.

Use <kx>...</kx> to surround every mathematical expression that uses KaTeX. Copy conceptIndex. Return only JSON in this shape: {"exercises":[{"conceptIndex":0,"title":"...","description":"succinct task","solution":"concise correct solution","imageDescription":"","solutionImageDescription":""}]}.`;

export const STRICT_JSON_ARRAY_SYSTEM_PROMPT = 'Respond strictly as a JSON array.';

export const BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT = (chapterTitle: string, pages: Array<{ imageNames: string[]; pageNumber: number; text: string }>): string => {
  return `${BOOK_CHAPTER_EXTRACTION_PROMPT}

Chapter: ${chapterTitle}

The following ordered pages and ${pages.reduce((count, { imageNames }) => count + imageNames.length, 0)} attached image(s) were extracted from Mathpix MMD ZIPs. Treat all supplied pages as one chapter-wide context. Use attached images only when they contain information needed to understand a concept introduced in this chapter. Ignore exercise-only images and exercise/solution content.

${pages.map(({ imageNames, pageNumber, text }) => `--- page ${pageNumber} ---\nAttached page images: ${imageNames.length ? imageNames.join(', ') : 'none'}\n${text}`).join('\n\n')}`;
};

export const BOOK_PAGE_EXTRACTION_REQUEST_PROMPT = (text: string, imageNames: string[]): string =>
  BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT('', [{ imageNames, pageNumber: 1, text }]);

export const BOOK_LANGUAGE_DETECTION_PROMPT = (pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Identify the primary natural language of this book using only the supplied Mathpix MMD text from its middle pages. Ignore formulas, code, proper names, citations, isolated foreign phrases, and bilingual glossary fragments when deciding the main prose language. If the pages contain multiple languages, choose the language used for the majority of explanatory or instructional prose.

Return only valid JSON in this exact shape using a lowercase ISO 639-1 two-letter code:
{"language":"en"}

Middle-page MMD text:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};

export const BOOK_SUBJECT_DETECTION_PROMPT = (bookLanguage: string, pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Classify the primary school-book category using only the supplied Mathpix MMD text from the book's middle pages. Choose exactly one of these stored values: en-math, en-ela, en-science, na.

The already-detected primary natural language of the book is ${bookLanguage}. Subject model classification is only used for English books; non-English books are assigned na before this prompt is called.

Classification rules for English books:
- en-math: mathematics instruction or mathematical problem solving.
- en-ela: English Language Arts, including English reading, literature, grammar, vocabulary, or writing instruction.
- en-science: natural or physical science such as biology, chemistry, physics, earth science, or general science.
- na: every subject outside those categories, including social studies, history, geography, computing, arts, business, and mixed/general material without a clear en-math, en-ela, or en-science majority.

Judge the dominant instructional subject, not isolated examples, formulas, passages, or chapter titles.

Return only valid JSON in this exact shape:
{"subject":"en-math"}

Middle-page MMD text:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};

export const BOOK_AGE_DETECTION_PROMPT = (bookLanguage: string, bookSubject: string, pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Determine the single most appropriate typical learner age, in whole years, for learning the supplied educational material. Use the actual prerequisite knowledge, conceptual difficulty, abstraction, vocabulary, reading complexity, mathematical/scientific sophistication, and expected learner independence shown by the material. Do not infer age from visual design, topic popularity, publication metadata, or isolated mature/child-friendly subject matter alone.

The already-detected primary language is ${bookLanguage} and the stored subject category is ${bookSubject}. The supplied pages are representative samples from different parts of the book, not necessarily one continuous section.

Return valid JSON containing exactly one property named "age". Its value must be one integer from 3 through 30.

Choose the age based only on the demonstrated prerequisite knowledge and difficulty. Do not default to a common school age when the evidence is ambiguous, and do not copy a number from these instructions.

Do not return an age range, grade, explanation, confidence score, additional properties, or any text outside the JSON.

Representative MMD text pages:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};

export const GENERATE_EXERCISES_REQUEST_PROMPT = (bookDetectedLanguage: string, input: unknown, learnerAge?: number): string => {
  return `${GENERATE_EXERCISES_PROMPT(bookDetectedLanguage, learnerAge)}\n${JSON.stringify(input)}`;
};

export const GENERATE_EXERCISES_RECOVERY_PROMPT = (bookDetectedLanguage: string, input: unknown, retry: number, maxRetries: number, learnerAge?: number): string => {
  return `${GENERATE_EXERCISES_PROMPT(bookDetectedLanguage, learnerAge)}
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

export const ABILITY_WORKFLOW_SYSTEM_PROMPT = (language: string, chapterTitle: string, learnerAge?: number): string => {
  return `Write strictly in ISO language ${language}. Use <kx>...</kx> for all formulas. Return complete valid JSON in the exact shape requested by the current workflow stage. Every source Exercise in this request belongs to chapter ${chapterTitle}; do not use or combine context from another chapter. ${LEARNER_AGE_PROMPT(learnerAge)}`;
};

// Compatibility aliases for callers outside this source bundle.
export const ATOMIC_ABILITY_WORKFLOW_SYSTEM_PROMPT = ABILITY_WORKFLOW_SYSTEM_PROMPT;
export const EXERCISE_ABILITIES_SYSTEM_PROMPT = ABILITY_WORKFLOW_SYSTEM_PROMPT;

export const REPAIR_SYSTEM_PROMPT = (language: string, learnerAge?: number): string => {
  return `Keep ISO language ${language}. Return only the requested JSON object. ${LEARNER_AGE_PROMPT(learnerAge)}`;
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

export const OPEN_ROUTER_VISUAL_SPEC_PROMPT = (visualPrompt: string, purpose: 'question' | 'solution', referenceScene = ''): string => {
  const vectorSchema = `Use a structured vector scene. Coordinates are ordinary SVG-like numbers, but DO NOT write SVG/XML. The application renders the scene deterministically and adds safe margins itself.

Supported element types:
- line: {"id":"...","type":"line","x1":0,"y1":0,"x2":100,"y2":100,"stroke":"black","strokeWidth":2,"dash":[6,4],"arrowStart":false,"arrowEnd":false}
- rect: {"id":"...","type":"rect","x":0,"y":0,"width":100,"height":50,"rx":0,"stroke":"black","strokeWidth":2,"fill":"none"}
- circle: {"id":"...","type":"circle","cx":50,"cy":50,"r":20,"stroke":"black","strokeWidth":2,"fill":"none"}
- ellipse: {"id":"...","type":"ellipse","cx":50,"cy":50,"rx":30,"ry":20,"stroke":"black","strokeWidth":2,"fill":"none"}
- polygon/polyline: {"id":"...","type":"polygon","points":[[0,0],[100,0],[50,80]],"stroke":"black","strokeWidth":2,"fill":"none"}
- arc: {"id":"...","type":"arc","cx":50,"cy":50,"r":20,"startAngle":0,"endAngle":90,"stroke":"black","strokeWidth":2}
- text: {"id":"...","type":"text","x":50,"y":50,"text":"A","fontSize":24,"anchor":"middle","fontWeight":"normal","fill":"black","rotate":0}

Every element needs a unique stable id. Keep labels as separate text elements. Use only black/white/gray/grey/red/blue/green/orange/purple/yellow/brown/transparent/none or hex colors. Prefer simple geometry and explicit labels. Do not put equations in paths; use text with ordinary Unicode mathematical symbols when practical. Scene width/height default to 960x640 and should normally be left at those values. Do not set viewBox unless a reference scene already supplies one.

STROKE STYLE RULE: omit "dash" by default and render ordinary boundaries, axes, partition dividers, grid lines, and measurement lines as SOLID. Use "dash" only when the VISUAL REQUEST explicitly requires a dashed, dotted, broken, hidden, auxiliary/construction, or otherwise non-solid line. Never invent dashed separators merely as a styling choice.`;

  if (referenceScene) {
    return `Modify an existing deterministic educational vector scene. Return ONLY a patch; do not redraw or restate unchanged objects. Preserve the existing dimensions, viewBox, coordinate system, positions, labels, styles, and all unchanged element ids. Add, remove, or update only what the requested worked solution requires. The application rejects patches that move content outside the preserved viewBox.

${vectorSchema}

Return only JSON in this exact shape:
{"format":"vector-patch","operations":[{"op":"add","element":{...}},{"op":"update","id":"existingId","element":{...complete replacement element with same id and type...}},{"op":"remove","id":"existingId"}]}
Include only operations actually needed. An update must contain the complete replacement element and keep the same id and type.

REFERENCE SCENE JSON:
${referenceScene}

VISUAL REQUEST:
${visualPrompt}`;
  }

  return `Decide whether this educational Ability visual genuinely requires photographic/natural imagery. Use raster ONLY when the task depends on photographic realism, natural texture, subtle material appearance, a real-world photo, or another property that geometric vector primitives cannot faithfully represent. Diagrams, geometry, graphs, charts, tables, symbols, number lines, coordinate planes, simple maps, layouts, and schematic objects MUST use the structured vector format. Never choose raster merely because vector construction is inconvenient.

${vectorSchema}

For vector output return only JSON:
{"format":"vector","scene":{"width":960,"height":640,"background":"white","elements":[...]}}
For genuinely photographic output return only:
{"format":"raster"}

${purpose === 'solution' ? 'This is a WORKED-SOLUTION visual. It must visibly show the complete correct result required by the prompt.' : 'This is a QUESTION visual. Do not reveal, highlight, pre-complete, or encode the answer unless the starting state itself explicitly requires it.'}

VISUAL REQUEST:
${visualPrompt}`;
};

// Kept as a compatibility alias for code outside this package that imported the
// older name. It now requests a structured scene rather than raw SVG markup.
export const OPEN_ROUTER_SVG_PROMPT = (visualPrompt: string, purpose: 'question' | 'solution'): string => OPEN_ROUTER_VISUAL_SPEC_PROMPT(visualPrompt, purpose);

export const OPEN_ROUTER_SOLUTION_RASTER_PROMPT = (visualPrompt: string): string => {
  return `Create the complete worked-solution visual. Show the correct constructed, drawn, labeled, shaded, plotted, graphed, marked, or modified result required by the solution. If this is an updated version of a question visual, preserve all unchanged base objects, labels, scale, coordinate system, and layout and apply only the requested change.

${visualPrompt}`;
};

export const FIX_ABILITIES_PROMPT = `Review every supplied Ability in this chapter and identify any error: factual, mathematical, logical, grammatical, spelling, ambiguity, incomplete or non-self-contained questions, incorrect or mismatched answers, mismatch between the two exercises and the target Skill, identical questions or concrete parameters, JSON/schema problems, and KaTeX syntax, escaping, or formula errors. The input contains every Ability from one chapter, each with its real stored id and chapter-local index; an Ability may be a parsed JSON object or a raw JSON string when its stored JSON is malformed. Also compare all supplied Abilities against one another and find duplicate Abilities within this chapter. A duplicate means two records represent the same Exercise-level Ability with the same or materially identical concrete question/answer content; do not call records duplicates merely because they train the same Skill with genuinely different concrete inputs. For every duplicate record, return an explicit duplicatePairs entry with both the canonical kept record id and the duplicate record id to delete: {"keptAbilityId":"stored-id-to-keep","deletedAbilityId":"stored-id-to-delete"}. For every duplicate set, keep the earliest supplied index as the canonical record. If three records are duplicates, return one pair for each later record, both pointing to the same earliest canonical record. Never invent an id or index that is not present in the supplied chapter. Never use a record marked for deletion as the kept record in another pair. Return reviews only for input indexes where you find an error. It is valid and preferred to omit correct Abilities entirely; a partial reviews array is expected. If there are no errors or duplicates return {"reviews":[],"duplicatePairs":[]}. For an erroneous Ability, list concise error descriptions and include the complete corrected Ability in ability: {"index":0,"hasErrors":true,"errors":["description"],"ability":{...}}. If you choose to include a correct Ability, use {"index":0,"hasErrors":false,"errors":[]}, but this is unnecessary. Do not repair an Ability whose record id you place in duplicatePairs as deletedAbilityId because that record will be deleted. Correct every other identified error while preserving the same target Skill, language, method, and difficulty. Each stored Ability represents one source Exercise. Do not split a coherent multi-step Ability into narrower sub-Abilities during repair; preserve the complete Exercise-level operation or operation sequence, method, direction, and difficulty. Make the minimum changes necessary. Keep learner-facing text compact: h should normally fit within 12 words, each q[].h within 32 words, and each q[].a within 38 words. Answers should contain only the result plus the minimum derivation needed to check the target operation, not tutorial prose or a restatement of the question. Every corrected Ability must preserve the required i, t, h, and q structure, with t=3 and exactly two q entries. The q[].p and q[].i values are semantic text descriptions for question and answer images, not image bytes, URLs, filenames, or generated images. Keep them empty when no visual is required. When a visual is required, preserve or minimally correct the standalone description so it remains consistent with the concrete question and answer. Never generate actual images in this stage, never replace a description with image data, and never rewrite an image-dependent task into text that reveals the visual information. For malformed stored JSON, provide valid string values for i and p. The two exercises must train the same complete Exercise-level Ability but use different concrete input parameters. ${EXERCISE_TEMPLATE_STYLE_PROMPT} For Ability repair, use only the reusable-template and self-containment parts of that shared style; the compact answer limits above override its request for step-by-step solution prose. Apply it without changing the target Exercise-level Ability. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Return only valid JSON in this exact top-level shape: {"reviews":[...],"duplicatePairs":[{"keptAbilityId":"stored-id-to-keep","deletedAbilityId":"stored-id-to-delete"}]}. Do not add markdown fences or commentary.`;

export const FIX_EXERCISES_PROMPT = `Review every supplied Exercise in this chapter and identify any error: factual, mathematical, logical, grammatical, spelling, ambiguity, incomplete or non-self-contained task text, incorrect or mismatched solution, a non-obvious solution that omits essential solving steps, unnecessary or missing imageDescription or solutionImageDescription, JSON/schema problems, and KaTeX syntax, escaping, or formula errors. Exercise records contain no image bytes and no image links; imageDescription and solutionImageDescription are the only visual-description fields. Treat both as strict semantic requirements, not illustration requests. imageDescription describes visual INPUT the learner must inspect; solutionImageDescription describes a visual OUTPUT required by the correct worked solution. Preserve the Exercise's learner modality while repairing it: do not turn a task whose target operation depends on interpreting or manipulating a representation into a textual surrogate merely because the represented facts could be written out in prose. Prefer imageDescription:"" only when the same target input, operation, and output genuinely remain intact without a visual. Clear imageDescription when a visual would be decorative, illustrative, motivational, redundant with text, or merely nice to have. Keep or create a nonempty imageDescription when task-essential information is encoded visually or spatially and writing that information into the task would change the learner operation or reveal what the learner must determine. In that exceptional case, imageDescription must be a complete standalone prompt sufficient to generate the task-essential visual later, including all required labels, shapes, values, relationships, and layout, but not the answer. Independently audit the EXPECTED ANSWER FORMAT of every Exercise before deciding it is correct. A missing solutionImageDescription is an error whenever the learner's requested answer or the worked solution includes, produces, completes, or modifies a drawing or visual artifact. This includes tasks that ask the learner to draw, sketch, plot, graph, construct, trace, complete, mark, label, annotate, shade, color, connect, move, rotate, reflect, translate, rearrange, correct, or otherwise alter a figure, coordinate plane, number line, diagram, chart, table, map, geometric construction, model, or visual representation. It is also required when the solution steps themselves perform one of those visual actions, even if a numeric or textual answer can additionally be stated. Do not treat a textual statement of the answer as a substitute for the required visual output. solutionImageDescription must completely describe the CORRECT finished solution visual and may reveal the answer. If the learner modifies the question visual, it must describe the completed correct version of that same visual while preserving unchanged objects, labels, scale, coordinate system, and layout. REMOVAL RULE: an existing nonempty solutionImageDescription is not proof that a solution image is required. Clear it when this answer-format audit shows the requested answer and worked method are fully representable in text/formulas and no drawing, plotting, construction, marking, or visual modification is required. Preserve or correct it only when a visual output is genuinely required. For an Exercise whose existing solutionImageDescription is empty, create one only when this answer-format audit says a visual output is required. Do not generate or return image bytes, URLs, filenames, imageIndexes, image, or images. The input contains every Exercise from one chapter, each with its real stored numeric id, conceptId, and chapter-local index. Also compare all supplied Exercises against one another and find duplicate Exercises within this chapter. When a conceptId has more than one Exercise, prefer retaining the single Exercise that requires the most learner thinking and information transformation, and propose weaker or redundant same-concept Exercises for deletion in duplicatePairs. Prefer a task that makes the learner transform, apply, infer, calculate, compare, construct, or solve from supplied information over a task that merely asks the learner to explain, describe, define, restate, recognize, or repeat information. Judge the actual task itself. If candidates require similar kinds of thinking, prefer the one with more meaningful reasoning or transformation steps; use the earliest supplied index only as a final tie-breaker. This is a preference rather than an absolute cardinality rule: do not force deletion solely to reach exactly one Exercise if multiple same-concept Exercises meaningfully require distinct transformations, reasoning paths, or outputs, or if you are not confident they are redundant. Treat records as duplicates when they are redundant for the concept or have the same or materially identical task, inputs, required method, and solution. For every record proposed for deletion, return an explicit duplicatePairs entry with both the selected kept record id and the record id to delete: {"keptExerciseId":1,"deletedExerciseId":2}. When deleting multiple same-concept Exercises in favor of one stronger Exercise, point those deletions to that same selected Exercise. Never invent an id or index that is not present in the supplied chapter. Never use a record marked for deletion as the kept record in another pair. Return reviews only for input indexes where you find an error. It is valid and preferred to omit correct Exercises entirely; a partial reviews array is expected. If there are no errors or duplicates return {"reviews":[],"duplicatePairs":[]}. For an erroneous Exercise, list concise error descriptions and include the complete corrected editable Exercise fields in exercise: {"index":0,"hasErrors":true,"errors":["description"],"exercise":{"title":"...","description":"...","solution":"...","imageDescription":"","solutionImageDescription":""}}. If you choose to include a correct Exercise, use {"index":0,"hasErrors":false,"errors":[]}, but this is unnecessary. Do not repair an Exercise whose record id you place in duplicatePairs as deletedExerciseId because that record will be deleted. Correct every other identified error while preserving the same learning target, language, method, scope, source meaning, difficulty, and learner modality. Make the minimum changes necessary. Preserve the represented form unless changing that form is explicitly part of the task: do not silently simplify, normalize, canonicalize, convert, relabel, or substitute an equivalent representation in a read/identify/reproduce/mark task. The corrected task and solution must be complete and self-contained except for information intentionally delegated to a genuinely crucial question visual described by imageDescription; solutionImageDescription may separately specify a required visual form of the worked result. ${EXERCISE_TEMPLATE_STYLE_PROMPT} ${EXERCISE_QUESTION_BREVITY_PROMPT} Treat needless verbosity in a generated Exercise description as a repairable quality error. Apply this style when rewriting generated Exercise description and solution; preserve source-book wording when fidelity requires it. Use <kx>...</kx> for every mathematical formula or expression, never dollar-delimited LaTeX, and escape every LaTeX backslash for valid JSON. Do not return or change database identity or relationship fields such as id, bookPage, conceptId, chapterId, or source; the browser preserves them locally. Return only valid JSON in this exact top-level shape: {"reviews":[...],"duplicatePairs":[{"keptExerciseId":1,"deletedExerciseId":2}]}. Do not add markdown fences or commentary.`;
