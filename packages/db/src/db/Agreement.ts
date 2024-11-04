export interface Agreement {
  id: string;
  price: string; // BN.toString()
  paid: boolean,
  completed: boolean,
}