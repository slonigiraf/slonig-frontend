export interface CanceledInsurance {
  workerSign: string;
  created: number; // timestamp
  canceled: number; // timestamp
  workerId: string;
  knowledgeId: string;
  cid: string;
  referee: string;
  employer: string;
}