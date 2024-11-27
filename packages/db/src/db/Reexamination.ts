export interface Reexamination {
  created: number; // timestamp
  stage: number, // lesson stage
  lastExamined: number; // timestamp
  valid: boolean;
  lesson: string;
  cid: string;
  amount: string;
  pubSign: string;
}