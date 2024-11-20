export interface Reexamination {
  stage: number, // lesson stage
  lastExamined: number; // timestamp
  valid: boolean;
  lesson: string;
  cid: string;
  amount: string;
  signOverReceipt: string;
}