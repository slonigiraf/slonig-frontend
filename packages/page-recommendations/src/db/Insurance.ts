export interface Insurance {
  id?: number;
  created: Date;
  cid: string;
  paraId: number;
  letterNumber: number;
  block: string;
  referee: string;
  worker: string;
  amount: string;
  signOverPrivateData: string;
  signOverReceipt: string;
  employer: string;
  workerSign: string;
  wasUsed: boolean;
}