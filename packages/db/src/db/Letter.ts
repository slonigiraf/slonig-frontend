export interface Letter {
  id?: number;
  created: number; // timestamp
  valid: boolean,
  reexamCount: number,
  lastReexamined: number; // timestamp
  lesson: string;
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