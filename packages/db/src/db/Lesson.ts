export type TutorAction = undefined | 'validate' | 'revoke' | 'skip' | 'mark_mastered_warm_up' | 'mark_mastered_mature' | 'mark_mastered_crude' | 'mark_for_repeat_warm_up' | 'mark_for_repeat_mature' | 'mark_for_repeat_crude';
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
  wasPriceDiscussed: boolean;
  isPaid: boolean;
  sent: boolean;
  lastAction: TutorAction;
}