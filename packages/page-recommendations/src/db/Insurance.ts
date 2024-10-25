export interface Insurance {
  id?: number;
  created: Date;
  valid: boolean;
  lesson: string;
  wasSkipped: boolean;
  workerId: string;
  cid: string;
  genesis: string;
  letterNumber: number;
  block: string;
  blockAllowed: string;
  referee: string;
  worker: string;
  amount: string;
  signOverPrivateData: string;
  signOverReceipt: string;
  employer: string;
  workerSign: string;
  wasUsed: boolean;
}