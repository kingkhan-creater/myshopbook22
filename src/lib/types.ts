import type { Timestamp, FieldValue } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  role: 'OWNER' | 'STAFF';
  fullName: string;
  email: string;
  photoUrl?: string;
  shopName?: string;
}

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

export interface ItemSnapshot {
  name: string;
  salePrice: number;
  photoBase64?: string;
}

export interface Message {
  id: string;
  senderId: string;
  createdAt: Timestamp;
  type: 'text' | 'image' | 'item';
  
  // Content fields
  text?: string | null;
  imageUrl?: string | null;
  itemSnapshot?: ItemSnapshot | null;

  // Deletion fields
  deletedFor?: string[];
  deletedForEveryone?: boolean;
  deletedAt?: Timestamp;

  // Fields for auditing deleted messages
  originalText?: string | null;
  originalImageUrl?: string | null;
  originalItemSnapshot?: ItemSnapshot | null;
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

// POSTS FEATURE TYPES

export type ReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export const ReactionTypes: ReactionType[] = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'];

export interface Reaction {
  userId: string;
  type: ReactionType;
  createdAt: Timestamp;
}


export interface Post {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  text: string;
  imageUrl?: string;
  createdAt: Timestamp;
  isDeleted: boolean;
  reactionCounts?: { [key in ReactionType]?: number };
  commentCount: number; // Denormalized for feed view
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  text: string;
  createdAt: Timestamp;
}

export interface PublicUserProfile {
  uid: string;
  fullName: string;
  photoUrl?: string;
  shopName?: string;
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  imageUrl: string;
  text?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface MarketplaceItem {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhotoUrl?: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  status: 'ACTIVE' | 'SOLD';
  createdAt: Timestamp;
}
