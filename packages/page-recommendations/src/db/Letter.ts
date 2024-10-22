export interface Letter {
  id?: number;
  created: Date;
  lesson: string;
  wasDiscussed: boolean;
  wasSkipped: boolean;
  workerId: string;
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