export interface UsageRight {
  used: boolean;
  created: number; // timestamp
  signOverReceipt: string;
  employer: string;
  workerSign: string;
}