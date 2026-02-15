'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
  addDoc,
  orderBy,
  Timestamp,
  updateDoc,
  increment,
  where
} from 'firebase/firestore';
import type { Customer, CustomerBill, BillItem, BillPayment, Item } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, IndianRupee, Landmark, PlusCircle, FileSignature, AlertTriangle, Trash2 } from 'lucide-react';
import Link from 'next/link';


export default function BillDetailPage({ params }: { params: { customerId: string, billId: string } }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const customerId = params.customerId;
  const billId = params.billId;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bill, setBill] = useState<CustomerBill | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // State for 'Add Payment' Dialog
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Online' | 'Other'>('Cash');
  
  // State for 'Add Item' Dialog
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<Item[]>([]);
  const [saleItem, setSaleItem] = useState<{itemId: string, qty: number, rate: number, stock: number} | null>(null);
  
  const isBillOpen = bill?.status === 'OPEN';

  useEffect(() => {
    if (!user || !customerId || !billId) return;
    setLoading(true);

    const billRef = doc(db, 'users', user.uid, 'bills', billId);
    const unsubBill = onSnapshot(billRef, (docSnap) => {
      if (docSnap.exists()) {
        setBill({ id: docSnap.id, ...docSnap.data() } as CustomerBill);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Bill not found.' });
        router.back();
      }
      setLoading(false);
    });

    const itemsQuery = query(collection(billRef, 'items'), orderBy('itemName', 'asc'));
    const unsubItems = onSnapshot(itemsQuery, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillItem)));
    });

    const paymentsQuery = query(collection(billRef, 'payments'), orderBy('createdAt', 'desc'));
    const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillPayment)));
    });
    
    // Fetch customer data once
    getDoc(doc(db, 'users', user.uid, 'customers', customerId)).then(docSnap => {
        if(docSnap.exists()) setCustomer({id: docSnap.id, ...docSnap.data()} as Customer)
    })

    return () => {
      unsubBill();
      unsubItems();
      unsubPayments();
    };
  }, [user, customerId, billId, router, toast]);
  
  // Effect to fetch inventory items when 'Add Item' dialog is opened
  useEffect(() => {
    if (isItemDialogOpen && user) {
        const itemsQuery = query(collection(db, 'users', user.uid, 'items'), where('stockQty', '>', 0));
        const unsubscribe = onSnapshot(itemsQuery, snapshot => {
            setInventoryItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
        });
        return () => unsubscribe();
    }
  }, [isItemDialogOpen, user]);


  const handleAddPayment = async () => {
    const amount = Number(paymentAmount);
    if (!user || !bill || !isBillOpen || !amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid payment amount' });
      return;
    }
    setIsSaving(true);
    try {
      const billRef = doc(db, 'users', user.uid, 'bills', billId);
      const customerRef = doc(db, 'users', user.uid, 'customers', customerId);
      const paymentRef = doc(collection(billRef, 'payments'));
      
      const batch = writeBatch(db);

      batch.set(paymentRef, {
          amount: amount,
          method: paymentMethod,
          createdAt: serverTimestamp(),
      });

      batch.update(billRef, {
          totalPaid: increment(amount),
          remaining: increment(-amount),
          updatedAt: serverTimestamp()
      });
      
      batch.update(customerRef, {
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
  
  const handleAddItem = async () => {
    if (!user || !bill || !isBillOpen || !saleItem || saleItem.qty <= 0) {
        toast({ variant: 'destructive', title: 'Invalid item details' });
        return;
    }
    setIsSaving(true);
    try {
        const { itemId, qty, rate } = saleItem;
        const total = qty * rate;
        const inventoryItem = inventoryItems.find(i => i.id === itemId);
        if(!inventoryItem) throw new Error("Selected item not found in inventory.");
        
        const billRef = doc(db, 'users', user.uid, 'bills', billId);
        const customerRef = doc(db, 'users', user.uid, 'customers', customerId);
        const stockItemRef = doc(db, 'users', user.uid, 'items', itemId);
        const billItemRef = doc(collection(billRef, 'items'));

        await runTransaction(db, async (transaction) => {
            const stockItemSnap = await transaction.get(stockItemRef);
            if (!stockItemSnap.exists() || stockItemSnap.data().stockQty < qty) {
                throw new Error(`Not enough stock for ${inventoryItem.name}.`);
            }
            
            transaction.update(stockItemRef, { stockQty: increment(-qty) });

            transaction.set(billItemRef, {
                itemId: itemId,
                itemName: inventoryItem.name,
                qty: qty,
                rate: rate,
                total: total,
            });
            
            transaction.update(billRef, {
                itemsTotal: increment(total),
                grandTotal: increment(total),
                remaining: increment(total),
                updatedAt: serverTimestamp()
            });
            
            transaction.update(customerRef, {
                totalCredit: increment(total)
            });
        });
        
        toast({ title: 'Item added successfully' });
        setIsItemDialogOpen(false);
        setSaleItem(null);
    } catch(e: any) {
        console.error("Failed to add item: ", e);
        toast({ variant: 'destructive', title: 'Failed to add item', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  const handleCloseBill = async () => {
      if (!user || !bill || !customer || !isBillOpen) return;
      setIsSaving(true);
      try {
        await runTransaction(db, async (transaction) => {
            const oldBillRef = doc(db, 'users', user.uid, 'bills', billId);
            const newBillRef = doc(collection(db, 'users', user.uid, 'bills'));
            
            // Close the old bill
            transaction.update(oldBillRef, {
                status: 'CLOSED',
                closedAt: serverTimestamp()
            });

            // Create a new open bill with the remaining balance as previousBalance
            transaction.set(newBillRef, {
                id: newBillRef.id,
                customerId: customerId,
                billNumber: Date.now().toString().slice(-6),
                status: 'OPEN',
                previousBalance: bill.remaining,
                itemsTotal: 0,
                totalPaid: 0,
                grandTotal: bill.remaining,
                remaining: bill.remaining,
                createdAt: serverTimestamp(),
            });
        });
        toast({ title: 'Bill Closed', description: `A new bill has been opened for ${customer.name}.` });
        router.push(`/dashboard/customers/${customerId}`);
      } catch (e: any) {
        console.error("Failed to close bill: ", e);
        toast({ variant: 'destructive', title: 'Failed to close bill', description: e.message });
      } finally {
          setIsSaving(false);
      }
  }

  if (loading || !bill || !customer) {
    return (
      <div className="container p-8 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" asChild>
                <Link href={`/dashboard/customers/${customerId}`}><ArrowLeft /></Link>
            </Button>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bill #{bill.billNumber}</h1>
                <p className="text-muted-foreground">For {customer.name}</p>
            </div>
        </div>
        {isBillOpen && (
             <Dialog>
                <DialogTrigger asChild><Button variant="destructive" disabled={isSaving}><FileSignature className="mr-2 h-4 w-4"/> Close Bill</Button></DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Are you sure?</DialogTitle>
                        <DialogDescription>
                            Closing this bill is permanent. A new bill will be created with the remaining balance of <span className="font-bold">${bill.remaining.toFixed(2)}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button variant="destructive" onClick={handleCloseBill} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Yes, Close Bill
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
      </div>

    {/* Summary Cards */}
    <div className="grid md:grid-cols-4 gap-4 mb-6 text-center">
        <Card><CardHeader><CardTitle>${bill.grandTotal.toFixed(2)}</CardTitle><CardDescription>Grand Total</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-green-600">${bill.totalPaid.toFixed(2)}</CardTitle><CardDescription>Paid</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-destructive">${bill.remaining.toFixed(2)}</CardTitle><CardDescription>Remaining</CardDescription></CardHeader></Card>
        <Card className={isBillOpen ? 'bg-green-100' : 'bg-red-100'}><CardHeader><CardTitle className={isBillOpen ? 'text-green-800' : 'text-red-800'}>{bill.status}</CardTitle><CardDescription>Status</CardDescription></CardHeader></Card>
    </div>

    <div className="grid md:grid-cols-2 gap-6">
        {/* Items Card */}
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bill Items</CardTitle>
                {isBillOpen && (
                    <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
                        <DialogTrigger asChild><Button size="sm"><PlusCircle className="mr-2 h-4 w-4"/>Add Item</Button></DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Add Item to Bill</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                                <Label>Item</Label>
                                <Select onValueChange={id => {
                                    const item = inventoryItems.find(i => i.id === id);
                                    if(item) setSaleItem({itemId: id, qty: 1, rate: item.salePrice, stock: item.stockQty });
                                }}>
                                    <SelectTrigger><SelectValue placeholder="Select an item"/></SelectTrigger>
                                    <SelectContent>{inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name} (Qty: {i.stockQty})</SelectItem>)}</SelectContent>
                                </Select>
                                {saleItem && (
                                    <>
                                        <div><Label>Quantity</Label><Input type="number" value={saleItem.qty} onChange={e => setSaleItem({...saleItem, qty: Number(e.target.value)})} max={saleItem.stock} /></div>
                                        <div><Label>Rate</Label><Input type="number" value={saleItem.rate} onChange={e => setSaleItem({...saleItem, rate: Number(e.target.value)})} /></div>
                                        <p className="font-bold">Total: ${(saleItem.qty * saleItem.rate).toFixed(2)}</p>
                                    </>
                                )}
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                <Button onClick={handleAddItem} disabled={isSaving || !saleItem || (saleItem && saleItem.qty > saleItem.stock)}>
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    {saleItem && saleItem.qty > saleItem.stock ? 'Not Enough Stock' : 'Add to Bill'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Rate</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {items.length > 0 ? items.map(item => (
                            <TableRow key={item.id}><TableCell>{item.itemName}</TableCell><TableCell>{item.qty}</TableCell><TableCell>${item.rate.toFixed(2)}</TableCell><TableCell className="text-right">${item.total.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={4} className="text-center h-24">No items yet.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Payments Card */}
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Payments</CardTitle>
                {isBillOpen && (
                    <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                        <DialogTrigger asChild><Button size="sm"><Landmark className="mr-2 h-4 w-4"/>Add Payment</Button></DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Add Payment (Wasooli)</DialogTitle><DialogDescription>Record a payment for this bill.</DialogDescription></DialogHeader>
                            <div className="space-y-4 py-4">
                                <div><Label>Amount</Label><Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00"/></div>
                                <div><Label>Method</Label><Select value={paymentMethod} onValueChange={(v:any) => setPaymentMethod(v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Card">Card</SelectItem><SelectItem value="Online">Online</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                <Button onClick={handleAddPayment} disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save Payment</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {payments.length > 0 ? payments.map(p => (
                            <TableRow key={p.id}><TableCell>{format(p.createdAt.toDate(), 'Pp')}</TableCell><TableCell>{p.method}</TableCell><TableCell className="text-right">${p.amount.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={3} className="text-center h-24">No payments yet.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>

    {!isBillOpen && (
        <Alert variant="destructive" className="mt-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This bill is closed.</AlertTitle>
            <AlertDescription>
                No more items or payments can be added. The remaining balance has been carried over to a new bill.
            </AlertDescription>
        </Alert>
    )}
    </div>
  );
}

    
