'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  updateDoc,
  increment,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';
import type { Supplier, PurchaseBill, PurchaseBillItem, SupplierPayment } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, Landmark } from 'lucide-react';
import Link from 'next/link';

export default function PurchaseBillDetailPage(props: { params: Promise<{ billId: string }>, searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { billId } = use(props.params);
  // Unwrap searchParams to satisfy dynamic API proxy
  use(props.searchParams);

  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [bill, setBill] = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // State for 'Add Payment' Dialog
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank Transfer' | 'Other'>('Cash');
  
  useEffect(() => {
    if (!user || !billId) return;
    setLoading(true);

    const billRef = doc(db, 'users', user.uid, 'purchaseBills', billId);
    const unsubBill = onSnapshot(billRef, async (docSnap) => {
      if (docSnap.exists()) {
        const billData = { id: docSnap.id, ...docSnap.data() } as PurchaseBill;
        setBill(billData);
        
        // Fetch supplier data
        const supplierRef = doc(db, 'users', user.uid, 'suppliers', billData.supplierId);
        const supplierSnap = await getDoc(supplierRef);
        if(supplierSnap.exists()) {
            setSupplier({id: supplierSnap.id, ...supplierSnap.data()} as Supplier);
        }

      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Purchase Bill not found.' });
        router.back();
      }
      setLoading(false);
    });

    return () => unsubBill();
  }, [user, billId, router, toast]);

  const handleAddPayment = async () => {
    const amount = Number(paymentAmount);
    if (!user || !bill || !amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid payment amount' });
      return;
    }
    
    const remainingOnBill = bill.totalAmount - bill.paymentGiven;
    if (amount > remainingOnBill) {
      toast({ variant: 'destructive', title: 'Payment exceeds balance', description: `You only need to pay $${remainingOnBill.toFixed(2)} on this bill.` });
      return;
    }
    
    setIsSaving(true);
    try {
      const billRef = doc(db, 'users', user.uid, 'purchaseBills', billId);
      const supplierRef = doc(db, 'users', user.uid, 'suppliers', bill.supplierId);
      
      const newPaymentForArray: SupplierPayment = {
          amount: amount,
          method: paymentMethod,
          createdAt: serverTimestamp(),
      };

      const batch = writeBatch(db);

      batch.update(billRef, {
          paymentGiven: increment(amount),
          payments: arrayUnion(newPaymentForArray)
      });
      
      batch.update(supplierRef, {
          totalPaid: increment(amount)
      });
      
      await batch.commit();
      
      toast({ title: 'Payment added successfully' });
      setIsPaymentDialogOpen(false);
      setPaymentAmount('');
    } catch (e: any) {
        console.error("Payment failed: ", e);
        toast({ variant: 'destructive', title: 'Payment failed', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  if (loading || !bill || !supplier) {
    return (
      <div className="container p-8 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  
  const remainingOnBill = bill.totalAmount - bill.paymentGiven;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" asChild>
                <Link href={`/dashboard/suppliers/${bill.supplierId}`}><ArrowLeft /></Link>
            </Button>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bill from {format(bill.billDate.toDate(), 'PPP')}</h1>
                <p className="text-muted-foreground">For {supplier.name}</p>
            </div>
        </div>
      </div>

    {/* Summary Cards */}
    <div className="grid md:grid-cols-3 gap-4 mb-6 text-center">
        <Card><CardHeader><CardTitle>${bill.totalAmount.toFixed(2)}</CardTitle><CardDescription>Total Amount</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-green-600">${bill.paymentGiven.toFixed(2)}</CardTitle><CardDescription>Paid</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-destructive">${remainingOnBill.toFixed(2)}</CardTitle><CardDescription>Remaining</CardDescription></CardHeader></Card>
    </div>

    <div className="grid md:grid-cols-2 gap-6">
        {/* Items Card */}
        <Card>
            <CardHeader>
                <CardTitle>Purchased Items</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {bill.items.length > 0 ? bill.items.map((item, idx) => (
                            <TableRow key={idx}><TableCell>{item.itemName}</TableCell><TableCell>{item.qty}</TableCell><TableCell>${item.price.toFixed(2)}</TableCell><TableCell className="text-right">${(item.qty * item.price).toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={4} className="text-center h-24">No items on this bill.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Payments Card */}
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Payment History</CardTitle>
                 <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                    <DialogTrigger asChild><Button size="sm" disabled={remainingOnBill <= 0}><Landmark className="mr-2 h-4 w-4"/>Add Payment</Button></DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Add Payment</DialogTitle><DialogDescription>Record a payment made to the supplier for this bill.</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-4">
                            <div><Label>Amount</Label><Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00"/></div>
                            <div><Label>Method</Label><Select value={paymentMethod} onValueChange={(v:any) => setPaymentMethod(v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank Transfer">Bank Transfer</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                            <Button onClick={handleAddPayment} disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save Payment</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {bill.payments && bill.payments.length > 0 ? bill.payments.sort((a,b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis()).map((p, idx) => (
                            <TableRow key={idx}><TableCell>{format((p.createdAt as Timestamp).toDate(), 'Pp')}</TableCell><TableCell>{p.method}</TableCell><TableCell className="text-right">${p.amount.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={3} className="text-center h-24">No payments recorded yet.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
    </div>
  );
}
