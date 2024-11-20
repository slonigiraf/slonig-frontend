export interface LetterTemplate {
  valid: boolean,
  lastExamined: number; // timestamp
  lesson: string;
  workerId: string; // TODO: delete
  knowledgeId: string; // Also used to discriminate from Reexamination, is it doesn't contain the field
  cid: string;
  genesis: string;
  letterNumber: number;
  block: string;
  referee: string; // TODO: delete
  worker: string;
  amount: string;
  signOverPrivateData: string;
  signOverReceipt: string;
}