export interface Repetition {
  created: number; // timestamp
  examCount: number,
  lastExamined: number; // timestamp
  workerId: string;
  knowledgeId: string;
}