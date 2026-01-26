export interface LetterTemplate {
  stage: number, // lesson stage
  valid: boolean,
  mature: boolean, // if this skill was already leant at previous day
  toRepeat: boolean,
  lastExamined: number; // timestamp
  lesson: string;
  knowledgeId: string; // Also used to discriminate from Reexamination, is it doesn't contain the field
  cid: string;
  genesis: string;
  letterId: number;
  block: string;
  worker: string;
  amount: string;
  privSign: string;
  pubSign: string;
}