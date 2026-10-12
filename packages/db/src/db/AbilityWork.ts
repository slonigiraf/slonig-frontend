/** Editable correction requests, one field per learner-facing Ability part. */
export interface AbilityFixInstructions {
  /** A whole-Ability correction takes priority over every detailed field. */
  overall: string;
  /** An empty short-form request means to regenerate both exercises automatically. */
  regenerateExercises?: boolean;
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

export type AbilityFixFieldKey = Exclude<keyof AbilityFixInstructions, 'overall' | 'regenerateExercises'>;

export const ABILITY_FIX_FIELDS: ReadonlyArray<{ key: AbilityFixFieldKey; label: string; image: boolean }> = [
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

export const emptyAbilityFixInstructions = (): AbilityFixInstructions => ({ overall: '', ...Object.fromEntries(ABILITY_FIX_FIELDS.map(({ key }) => [key, ''])) }) as AbilityFixInstructions;

/** Whole-Ability feedback overrides (and discards) every per-field note. */
export const effectiveAbilityFixInstructions = (instructions: AbilityFixInstructions): AbilityFixInstructions => instructions.overall?.trim()
  ? { ...emptyAbilityFixInstructions(), overall: instructions.overall.trim() }
  : { ...emptyAbilityFixInstructions(), ...instructions, overall: '' };

/** Scheduling without written text notes defaults to full regeneration. Keep image
 * errors/notes intact so the same queued run can repair the flagged visuals too. */
export function prepareAbilityFixForScheduling (instructions: AbilityFixInstructions): AbilityFixInstructions {
  const effective = effectiveAbilityFixInstructions(instructions);
  const hasTextNotes = Boolean(effective.overall) || ABILITY_FIX_FIELDS.some(({ key, image }) => !image && Boolean(effective[key]?.trim()));

  return { ...effective, regenerateExercises: !hasTextNotes };
}

export const abilityFixHasTextChanges = (instructions: AbilityFixInstructions): boolean => Boolean(instructions.regenerateExercises) || Boolean(instructions.overall?.trim()) || ABILITY_FIX_FIELDS.some(({ key, image }) => !image && Boolean(instructions[key]?.trim()));
export const abilityFixHasChanges = (instructions: AbilityFixInstructions): boolean => abilityFixHasTextChanges(instructions) || ABILITY_FIX_FIELDS.some(({ key }) => Boolean(instructions[key]?.trim()));

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
