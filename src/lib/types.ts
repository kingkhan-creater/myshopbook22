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

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  totalPurchase: number;
  totalPaid: number;
  createdAt: Timestamp;
}

export interface PurchaseBillItem {
  itemId: string; // Can be 'new' for a new item
  itemName: string;
  qty: number;
  price: number;
}

export interface PurchaseBill {
  id: string;
  supplierId: string;
  billDate: Timestamp;
  items: PurchaseBillItem[];
  totalAmount: number;
  paymentGiven: number;
  createdAt: Timestamp;
}
