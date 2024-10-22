export interface Insurance {
  id?: number;
  created: Date;
  lastReexamined?: Date;
  reexamCount?: number;
  lesson?: string;
  forReexamining?: boolean;
  wasDiscussed?: boolean;
  wasSkipped?: boolean;
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