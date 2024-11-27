export interface CanceledLetter {
  pubSign: string;
  created: number; // timestamp
  examCount: number,
  canceled: number; // timestamp
  workerId: string;
  knowledgeId: string;
  cid: string;
  referee: string;
}