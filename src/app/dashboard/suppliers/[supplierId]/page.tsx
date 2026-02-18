'use client';

import { useState, useEffect, useMemo, use } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import type { Supplier, PurchaseBill } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';

const BillCard = ({ bill }: { bill: PurchaseBill }) => {
  const remaining = bill.totalAmount - bill.paymentGiven;
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">Bill from {format(bill.billDate.toDate(), 'PPP')}</CardTitle>
            <CardDescription>ID: {bill.id}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="font-bold text-base">
                <p className="text-muted-foreground">Total Amount</p>
                <p className="font-semibold">${bill.totalAmount.toFixed(2)}</p>
            </div>
             <div className="font-bold text-base">
                <p className="text-muted-foreground">Total Paid</p>
                <p className="font-semibold text-green-600">${bill.paymentGiven.toFixed(2)}</p>
            </div>
        </div>
        <div className="p-4 bg-muted rounded-lg text-center">
            <p className="text-muted-foreground">Remaining Payable</p>
            <p className="text-2xl font-bold text-destructive">${remaining.toFixed(2)}</p>
        </div>
      </CardContent>
       <CardFooter>
        <Button asChild className="w-full">
            <Link href={`/dashboard/suppliers/bill/${bill.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                View Details & Payments
            </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function SupplierLedgerPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = use(params);
  const { user } = useAuth();
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !supplierId) return;
    setLoading(true);
    
    const supplierRef = doc(db, 'users', user.uid, 'suppliers', supplierId);
    const unsubSupplier = onSnapshot(supplierRef, (doc) => {
      if (doc.exists()) {
        setSupplier({ id: doc.id, ...doc.data() } as Supplier);
      } else {
        toast({ variant: 'destructive', title: 'Supplier not found' });
      }
    });

    const billsQuery = query(
      collection(db, 'users', user.uid, 'purchaseBills'),
      where('supplierId', '==', supplierId)
    );
    const unsubBills = onSnapshot(billsQuery, (snapshot) => {
      const billsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseBill));
      billsData.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setBills(billsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching bills:", error);
      toast({ variant: 'destructive', title: 'Error fetching bills' });
      setLoading(false);
    });

    return () => {
      unsubSupplier();
      unsubBills();
    }
  }, [user, supplierId, toast]);

  const totalBalance = useMemo(() => {
    return supplier ? (supplier.totalPurchase || 0) - (supplier.totalPaid || 0) : 0;
  }, [supplier]);

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  if (loading) {
    return <div className="container p-8"><Skeleton className="h-64 w-full" /></div>;
  }
  if (!supplier) {
    return <div className="container p-8 text-center">Supplier not found.</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/suppliers"><ArrowLeft /></Link>
        </Button>
        <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
                <AvatarFallback className="text-2xl">{getInitials(supplier.name)}</AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
                <p className="text-muted-foreground">{supplier.phone}</p>
            </div>
        </div>
      </div>
      
      <Card className="mb-6 bg-accent text-accent-foreground">
        <CardHeader>
            <CardTitle>Total Payable Balance</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-4xl font-bold">${totalBalance.toFixed(2)}</p>
        </CardContent>
      </Card>
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Bill History</h2>
      </div>

      <div className="space-y-4">
        {bills.length > 0 ? (
          bills.map(bill => <BillCard key={bill.id} bill={bill} />)
        ) : (
          <Card className="flex items-center justify-center h-48 border-dashed">
            <CardContent className="text-center">
                <p className="text-lg font-semibold">No Bills Found</p>
                <p className="text-muted-foreground">Create a purchase from the 'Items' page to generate a bill for this supplier.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
