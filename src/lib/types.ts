import type { Timestamp } from 'firebase/firestore';

export interface Item {
  id: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  stockQty: number;
  supplier?: string;
  createdAt: Timestamp;
}
