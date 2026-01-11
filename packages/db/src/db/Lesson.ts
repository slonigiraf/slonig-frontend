export interface Lesson {
  id: string;
  created: number; // timestamp
  cid: string;
  tutor: string;
  student: string;
  toLearnCount: number;
  learnStep: number;
  toReexamineCount: number;
  reexamineStep: number;
  dPrice: string;
  dWarranty: string;
  dValidity: number;
  isPaid: boolean;
}