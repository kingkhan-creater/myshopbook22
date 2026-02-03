import type { Timestamp } from 'firebase/firestore';

export interface Item {
  id: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  stockQty: number;
  supplier?: string;
  photoUrl?: string;
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

export interface Customer {
    id: string;
    name: string;
    phone?: string;
    address?: string;
    totalCredit: number;
    totalPaid: number;
    createdAt: Timestamp;
}

export interface Payment {
    amount: number;
    date: Timestamp;
    method: 'Cash' | 'Card' | 'Online' | 'Other';
}

export interface CustomerBillItem {
    itemId: string;
    itemName: string;
    qty: number;
    rate: number;
}

export interface CustomerBill {
    id: string;
    billNumber: string;
    status: 'OPEN' | 'CLOSED';
    items: CustomerBillItem[];
    payments: Payment[];
    previousBalance: number;
    totalAmount: number;
    totalPaid: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
