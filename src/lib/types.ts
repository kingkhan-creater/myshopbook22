import type { Timestamp, FieldValue } from 'firebase/firestore';

export interface Item {
  id: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  stockQty: number;
  supplier?: string;
  photoBase64?: string;
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
  photoBase64?: string;
}

export interface SupplierPayment {
  amount: number;
  method: string;
  createdAt: Timestamp | FieldValue;
}

export interface PurchaseBillItem {
  itemId: string; // Can be 'new' for a new item
  itemName: string;
  qty: number;
  price: number;
  sellingPrice: number;
}

export interface PurchaseBill {
  id: string;
  supplierId: string;
  billDate: Timestamp;
  items: PurchaseBillItem[];
  totalAmount: number;
  paymentGiven: number; // This is the total paid for this specific bill
  payments?: SupplierPayment[]; // History of payments for this bill
  createdAt: Timestamp;
}

export interface Customer {
    id:string;
    name: string;
    phone?: string;
    address?: string;
    totalCredit: number;
    totalPaid: number;
    createdAt: Timestamp;
    photoBase64?: string;
}

// Represents a payment document in the subcollection
export interface BillPayment {
    id: string;
    amount: number;
    method: 'Cash' | 'Card' | 'Online' | 'Other';
    createdAt: Timestamp;
}

// Represents an item document in the subcollection
export interface BillItem {
    id: string;
    itemId: string;
    itemName: string;
    qty: number;
    rate: number;
    discount?: number;
    total: number;
}

export interface CustomerBill {
  id: string;
  customerId: string;
  billNumber: string;
  status: 'OPEN' | 'CLOSED';
  // Items and Payments are now subcollections, not arrays.
  previousBalance: number;
  itemsTotal: number;
  grandTotal: number;
  totalPaid: number;
  remaining: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  closedAt?: Timestamp;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: Timestamp;
  createdAt: Timestamp;
}
