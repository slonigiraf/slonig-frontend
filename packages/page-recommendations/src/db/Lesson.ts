export interface Lesson {
  id: string;
  created: Date;
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
}