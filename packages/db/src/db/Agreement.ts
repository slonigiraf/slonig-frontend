export interface Agreement {
  id: string;
  price: string; // BN.toString()
  penaltySent: boolean,
  paid: boolean,
  completed: boolean,
}