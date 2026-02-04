'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  increment,
  writeBatch,
} from 'firebase/firestore';
import type { Customer, CustomerBill, Payment } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, IndianRupee, Landmark } from 'lucide-react';
import Link from 'next/link';

const BillCard = ({ bill }: { bill: CustomerBill }) => {
  const isBillOpen = bill.status === 'OPEN';
  const grandTotal = bill.grandTotal;
  const remaining = bill.remaining;

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
                <p className="font-semibold">${grandTotal.toFixed(2)}</p>
            </div>
             <div className="font-bold text-base">
                <p className="text-muted-foreground">Total Paid</p>
                <p className="font-semibold text-green-600">${bill.totalPaid.toFixed(2)}</p>
            </div>
        </div>
        <div className="p-4 bg-muted rounded-lg text-center">
            <p className="text-muted-foreground">Remaining Balance</p>
            <p className="text-2xl font-bold text-destructive">${remaining.toFixed(2)}</p>
        </div>
        
        {bill.payments?.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Payments</h4>
            <ul className="space-y-2 text-sm">
              {bill.payments.map((p, i) => (
                 <li key={i} className="flex justify-between items-center bg-background p-2 rounded-md">
                   <span>Paid ${p.amount.toFixed(2)} via {p.method}</span>
                   <span className="text-xs text-muted-foreground">{format(p.date.toDate(), 'Pp')}</span>
                 </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
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
  
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Online' | 'Other'>('Cash');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

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

  const { openBill, totalBalance } = useMemo(() => {
    const openBill = bills.find(b => b.status === 'OPEN') || null;
    const balance = customer ? (customer.totalCredit || 0) - (customer.totalPaid || 0) : 0;
    return { openBill, totalBalance: balance };
  }, [bills, customer]);


  const handleAddPayment = async () => {
    const amount = Number(paymentAmount);
    if (!user || !openBill || !amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid payment amount' });
      return;
    }
    setIsSavingPayment(true);
    try {
      const customerRef = doc(db, 'users', user.uid, 'customers', customerId);
      const billRef = doc(db, 'users', user.uid, 'bills', openBill.id);

      await runTransaction(db, async (transaction) => {
        const billDoc = await transaction.get(billRef);
        if (!billDoc.exists()) throw new Error("Bill does not exist!");

        const billData = billDoc.data() as CustomerBill;
        const newPayment: Payment = {
            amount: amount,
            date: serverTimestamp() as Timestamp,
            method: paymentMethod,
        };

        const newTotalPaid = billData.totalPaid + amount;
        
        transaction.update(billRef, {
            payments: [...billData.payments, newPayment],
            totalPaid: newTotalPaid,
            remaining: billData.grandTotal - newTotalPaid,
        });

        transaction.update(customerRef, {
            totalPaid: increment(amount),
        });
      });
      
      toast({ title: 'Payment added successfully' });
      setIsPaymentDialogOpen(false);
      setPaymentAmount('');
    } catch (e: any) {
        console.error("Payment failed: ", e);
        toast({ variant: 'destructive', title: 'Payment failed', description: e.message });
    } finally {
        setIsSavingPayment(false);
    }
  }

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
        {openBill && (
          <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Landmark className="mr-2 h-4 w-4" /> Add Payment (Wasooli)
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Payment to Open Bill</DialogTitle>
                <DialogDescription>Enter the amount received from the customer.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
                </div>
                 <div>
                  <Label htmlFor="method">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                    <SelectTrigger id="method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleAddPayment} disabled={isSavingPayment}>
                    {isSavingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Save Payment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-4">
        {bills.length > 0 ? (
          bills.map(bill => <BillCard key={bill.id} bill={bill} />)
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
