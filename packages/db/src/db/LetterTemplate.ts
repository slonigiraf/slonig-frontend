export interface LetterTemplate {
  stage: number, // lesson stage
  valid: boolean,
  lastExamined: number; // timestamp
  lesson: string;
  knowledgeId: string; // Also used to discriminate from Reexamination, is it doesn't contain the field
  cid: string;
  genesis: string;
  letterNumber: number;
  block: string;
  worker: string;
  amount: string;
  signOverPrivateData: string;
  signOverReceipt: string;
}