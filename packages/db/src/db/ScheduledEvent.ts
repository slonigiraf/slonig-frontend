export type ScheduledEventType = 'LOG' | 'BAN' | 'SOFT_BAN';

export interface ScheduledEvent {
  id?: number; // auto increment
  type: ScheduledEventType;
  deadline: number; // timestamp
  data: string;
}