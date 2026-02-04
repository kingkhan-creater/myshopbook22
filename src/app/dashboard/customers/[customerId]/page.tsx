'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import type { Customer, CustomerBill } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';

const BillCard = ({ bill, customerId }: { bill: CustomerBill, customerId: string }) => {
  const isBillOpen = bill.status === 'OPEN';

  return (
    <Card className={isBillOpen ? 'border-primary' : ''}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">Bill #{bill.billNumber}</CardTitle>
            <CardDescription>{format(bill.createdAt.toDate(), 'PPP')}</CardDescription>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${isBillOpen ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {bill.status}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
                <p className="text-muted-foreground">Previous Balance</p>
                <p className="font-semibold">${bill.previousBalance.toFixed(2)}</p>
            </div>
            <div>
                <p className="text-muted-foreground">Items Total</p>
                <p className="font-semibold">${bill.itemsTotal.toFixed(2)}</p>
            </div>
            <div className="font-bold text-base">
                <p className="text-muted-foreground">Grand Total</p>
                <p className="font-semibold">${bill.grandTotal.toFixed(2)}</p>
            </div>
             <div className="font-bold text-base">
                <p className="text-muted-foreground">Total Paid</p>
                <p className="font-semibold text-green-600">${bill.totalPaid.toFixed(2)}</p>
            </div>
        </div>
        <div className="p-4 bg-muted rounded-lg text-center">
            <p className="text-muted-foreground">Remaining Balance</p>
            <p className="text-2xl font-bold text-destructive">${bill.remaining.toFixed(2)}</p>
        </div>
      </CardContent>
       <CardFooter>
        <Button asChild className="w-full">
            <Link href={`/dashboard/customers/${customerId}/bill/${bill.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                View Details
            </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function CustomerLedgerPage() {
  const { user } = useAuth();
  const params = useParams();
  const customerId = params.customerId as string;
  const { toast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bills, setBills] = useState<CustomerBill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !customerId) return;
    setLoading(true);
    
    // Fetch customer details
    const customerRef = doc(db, 'users', user.uid, 'customers', customerId);
    const unsubCustomer = onSnapshot(customerRef, (doc) => {
      if (doc.exists()) {
        setCustomer({ id: doc.id, ...doc.data() } as Customer);
      } else {
        toast({ variant: 'destructive', title: 'Customer not found' });
      }
    });

    // Fetch customer bills
    const billsQuery = query(
      collection(db, 'users', user.uid, 'bills'),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    const unsubBills = onSnapshot(billsQuery, (snapshot) => {
      setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerBill)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching bills:", error);
      toast({ variant: 'destructive', title: 'Error fetching bills' });
      setLoading(false);
    });

    return () => {
      unsubCustomer();
      unsubBills();
    }
  }, [user, customerId, toast]);

  const { totalBalance } = useMemo(() => {
    const balance = customer ? (customer.totalCredit || 0) - (customer.totalPaid || 0) : 0;
    return { totalBalance: balance };
  }, [customer]);

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  if (loading) {
    return <div className="container p-8"><Skeleton className="h-64 w-full" /></div>;
  }
  if (!customer) {
    return <div className="container p-8 text-center">Customer not found.</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/customers"><ArrowLeft /></Link>
        </Button>
        <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
                <AvatarFallback className="text-2xl">{getInitials(customer.name)}</AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
                <p className="text-muted-foreground">{customer.phone}</p>
            </div>
        </div>
      </div>
      
      <Card className="mb-6 bg-accent text-accent-foreground">
        <CardHeader>
            <CardTitle>Total Outstanding Balance</CardTitle>
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
          bills.map(bill => <BillCard key={bill.id} bill={bill} customerId={customerId} />)
        ) : (
          <Card className="flex items-center justify-center h-48 border-dashed">
            <CardContent className="text-center">
                <p className="text-lg font-semibold">No Bills Found</p>
                <p className="text-muted-foreground">Create a sale from the 'Items' page to generate a bill.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
