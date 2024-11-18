export interface CanceledLetter {
  created: number; // timestamp
  examCount: number,
  lastExamined: number; // timestamp
  workerId: string;
  knowledgeId: string;
  cid: string;
  referee: string;
}