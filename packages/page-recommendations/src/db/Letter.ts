export interface Letter {
  id?: number;
  created: Date;
  valid: boolean,
  reexamCount: number,
  lastReexamined: Date;
  lesson: string;
  wasSkipped: boolean;
  workerId: string;
  knowledgeId: string;
  cid: string;
  genesis: string;
  letterNumber: number;
  block: string;
  referee: string;
  worker: string;
  amount: string;
  signOverPrivateData: string;
  signOverReceipt: string;
}