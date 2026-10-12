/** Editable correction requests, one field per learner-facing Ability part. */
export interface AbilityFixInstructions {
  title: string;
  exercise1Question: string;
  exercise1QuestionImage: string;
  exercise1Answer: string;
  exercise1AnswerImage: string;
  exercise2Question: string;
  exercise2QuestionImage: string;
  exercise2Answer: string;
  exercise2AnswerImage: string;
}

export const ABILITY_FIX_FIELDS: ReadonlyArray<{ key: keyof AbilityFixInstructions; label: string; image: boolean }> = [
  { key: 'title', label: 'Ability title', image: false },
  { key: 'exercise1Question', label: 'Exercise 1 question', image: false },
  { key: 'exercise1QuestionImage', label: 'Exercise 1 question image', image: true },
  { key: 'exercise1Answer', label: 'Exercise 1 answer', image: false },
  { key: 'exercise1AnswerImage', label: 'Exercise 1 answer image', image: true },
  { key: 'exercise2Question', label: 'Exercise 2 question', image: false },
  { key: 'exercise2QuestionImage', label: 'Exercise 2 question image', image: true },
  { key: 'exercise2Answer', label: 'Exercise 2 answer', image: false },
  { key: 'exercise2AnswerImage', label: 'Exercise 2 answer image', image: true }
];

export const emptyAbilityFixInstructions = (): AbilityFixInstructions => Object.fromEntries(ABILITY_FIX_FIELDS.map(({ key }) => [key, ''])) as unknown as AbilityFixInstructions;
export const abilityFixHasTextChanges = (instructions: AbilityFixInstructions): boolean => ABILITY_FIX_FIELDS.some(({ key, image }) => !image && Boolean(instructions[key]?.trim()));
export const abilityFixHasChanges = (instructions: AbilityFixInstructions): boolean => ABILITY_FIX_FIELDS.some(({ key }) => Boolean(instructions[key]?.trim()));

export interface BookAbilityWorkItem {
  /** Stable, type-prefixed identity. */
  id: string;
  kind: 'split' | 'fix';
  conceptId: number;
  recordId?: string;
  instructions?: AbilityFixInstructions;
}

export interface BookAbilityChangeLogEntry {
  id?: number;
  bookId: number;
  recordId: string;
  conceptId?: number;
  title: string;
  source: 'ai' | 'user';
  summary: string;
  updatedAt: number;
}
