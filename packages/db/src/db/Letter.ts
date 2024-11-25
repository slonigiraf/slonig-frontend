export interface Letter {
  created: number; // timestamp
  examCount: number,
  lastExamined: number; // timestamp
  workerId: string;
  knowledgeId: string;
  cid: string;
  genesis: string;
  letterId: number;
  block: string;
  referee: string;
  worker: string;
  amount: string;
  privSign: string;
  pubSign: string;
}