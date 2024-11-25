export interface UsageRight {
  used: boolean;
  created: number; // timestamp
  pubSign: string;
  employer: string;
  workerSign: string;
  referee: string;
  letterId: number;
}