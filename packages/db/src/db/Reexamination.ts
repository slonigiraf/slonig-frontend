export interface Reexamination {
  lastExamined: number; // timestamp
  valid: boolean;
  lesson: string;
  cid: string;
  amount: string;
  signOverReceipt: string;
}