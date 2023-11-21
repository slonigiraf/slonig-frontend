export interface Insurance {
  id?: number;
  created: Date;
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