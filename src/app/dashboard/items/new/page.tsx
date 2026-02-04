'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  onSnapshot,
  doc,
  writeBatch,
  serverTimestamp,
  increment,
  addDoc,
  getDocs,
  where,
} from 'firebase/firestore';
import type { Item, Supplier } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Loader2, UserPlus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type BillItem = {
  rowId: string;
  itemId: string | 'new';
  itemName: string;
  qty: number;
  price: number;
};

const supplierSchema = z.object({
    name: z.string().min(2, { message: "Supplier name is required." }),
    phone: z.string().optional(),
    address: z.string().optional(),
});
type SupplierFormValues = z.infer<typeof supplierSchema>;

export default function PurchasePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [paymentGiven, setPaymentGiven] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);

  const supplierForm = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

  useEffect(() => {
    if (!user) return;
    
    const fetchInitialData = async () => {
        setLoading(true);
        const itemsUnsub = onSnapshot(collection(db, 'users', user.uid, 'items'), snapshot => {
            setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
        });

        const suppliersUnsub = onSnapshot(collection(db, 'users', user.uid, 'suppliers'), snapshot => {
            setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
        });

        setLoading(false);
        return () => {
            itemsUnsub();
            suppliersUnsub();
        };
    };

    fetchInitialData();
  }, [user]);

  const addBillRow = () => {
    setBillItems([
      ...billItems,
      {
        rowId: new Date().getTime().toString(),
        itemId: '',
        itemName: '',
        qty: 1,
        price: 0,
      },
    ]);
  };

  const removeBillRow = (rowId: string) => {
    setBillItems(billItems.filter(item => item.rowId !== rowId));
  };

  const handleBillItemChange = <K extends keyof BillItem>(
    rowId: string,
    field: K,
    value: BillItem[K]
  ) => {
    setBillItems(
      billItems.map(item => {
        if (item.rowId === rowId) {
          const updatedItem = { ...item, [field]: value };
          if(field === 'itemId' && value !== 'new') {
            const selectedItem = items.find(i => i.id === value);
            if (selectedItem) {
                updatedItem.itemName = selectedItem.name;
                updatedItem.price = selectedItem.purchasePrice;
            }
          }
          return updatedItem;
        }
        return item;
      })
    );
  };
  
  const summary = useMemo(() => {
    const totalQty = billItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const grandTotal = billItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
    const remaining = grandTotal - Number(paymentGiven || 0);
    return { totalQty, grandTotal, remaining };
  }, [billItems, paymentGiven]);

  const handleSaveSupplier = async (values: SupplierFormValues) => {
    if (!user) return;
    supplierForm.control.disabled = true;
    try {
        const suppliersRef = collection(db, 'users', user.uid, 'suppliers');
        const newSupplierRef = await addDoc(suppliersRef, {
            ...values,
            totalPurchase: 0,
            totalPaid: 0,
            createdAt: serverTimestamp(),
        });
        setSelectedSupplierId(newSupplierRef.id);
        toast({ title: "Supplier Added", description: `${values.name} has been added.` });
        setIsSupplierDialogOpen(false);
        supplierForm.reset();
    } catch(e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not add supplier.' });
    } finally {
        supplierForm.control.disabled = false;
    }
  }

  const handleSaveBill = async () => {
    if (!user || !selectedSupplierId || billItems.length === 0) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a supplier and add at least one item.' });
        return;
    }
    setIsSaving(true);
    
    try {
        const batch = writeBatch(db);
        const userItemsRef = collection(db, 'users', user.uid, 'items');

        for (const billItem of billItems) {
            if (billItem.itemId === 'new') {
                // Create new item
                const newItemRef = doc(userItemsRef);
                batch.set(newItemRef, {
                    name: billItem.itemName,
                    purchasePrice: billItem.price,
                    salePrice: billItem.price, // Default sale price to purchase price
                    stockQty: billItem.qty,
                    createdAt: serverTimestamp(),
                });
            } else {
                // Update existing item
                const itemRef = doc(db, 'users', user.uid, 'items', billItem.itemId);
                batch.update(itemRef, { stockQty: increment(billItem.qty) });
            }
        }
        
        // Update supplier totals
        const supplierRef = doc(db, 'users', user.uid, 'suppliers', selectedSupplierId);
        batch.update(supplierRef, {
            totalPurchase: increment(summary.grandTotal),
            totalPaid: increment(paymentGiven)
        });

        // Create purchase bill document
        const billRef = collection(db, 'users', user.uid, 'purchaseBills');
        await addDoc(billRef, {
            supplierId: selectedSupplierId,
            billDate: serverTimestamp(),
            items: billItems.map(({rowId, ...rest}) => rest),
            totalAmount: summary.grandTotal,
            paymentGiven: paymentGiven,
            createdAt: serverTimestamp(),
        });
        
        await batch.commit();

        toast({ title: 'Success', description: 'Purchase bill saved successfully.' });
        router.push('/dashboard/items');

    } catch (e: any) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Error', description: `Could not save bill: ${e.message}` });
    } finally {
        setIsSaving(false);
    }
  };


  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
               <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/items"><ArrowLeft /></Link>
               </Button>
               <div>
                <CardTitle className="text-3xl font-bold tracking-tight">New Purchase Bill</CardTitle>
                <CardDescription>Add items to your inventory from a supplier.</CardDescription>
               </div>
            </div>
            <Button onClick={handleSaveBill} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Supplier Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                    {loading ? <p>Loading suppliers...</p> : (
                         <div className="flex items-center gap-2">
                             <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                             <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="icon"><UserPlus/></Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add New Supplier</DialogTitle>
                                        <DialogDescription>Enter the details for the new supplier.</DialogDescription>
                                    </DialogHeader>
                                    <Form {...supplierForm}>
                                        <form onSubmit={supplierForm.handleSubmit(handleSaveSupplier)} className="space-y-4">
                                            <FormField control={supplierForm.control} name="name" render={({field}) => (
                                                <FormItem><FormLabel>Supplier Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={supplierForm.control} name="phone" render={({field}) => (
                                                <FormItem><FormLabel>Phone (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={supplierForm.control} name="address" render={({field}) => (
                                                <FormItem><FormLabel>Address (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <DialogFooter>
                                                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                                <Button type="submit" disabled={supplierForm.control.disabled}>Save Supplier</Button>
                                            </DialogFooter>
                                        </form>
                                    </Form>
                                </DialogContent>
                             </Dialog>
                         </div>
                    )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Bill Items</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40%]">Item</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Subtotal</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {billItems.map(item => (
                                <TableRow key={item.rowId}>
                                    <TableCell>
                                        <Select
                                          value={item.itemId}
                                          onValueChange={(value) => handleBillItemChange(item.rowId, 'itemId', value)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select an item" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="new">-- Create New Item --</SelectItem>
                                                {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        {item.itemId === 'new' && (
                                            <Input 
                                                placeholder="Enter new item name"
                                                className="mt-2"
                                                value={item.itemName}
                                                onChange={(e) => handleBillItemChange(item.rowId, 'itemName', e.target.value)}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" placeholder="0" value={item.qty} onChange={(e) => handleBillItemChange(item.rowId, 'qty', parseInt(e.target.value) || 0)} />
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" placeholder="0.00" value={item.price} onChange={(e) => handleBillItemChange(item.rowId, 'price', parseFloat(e.target.value) || 0)} />
                                    </TableCell>
                                    <TableCell>${(item.qty * item.price).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => removeBillRow(item.rowId)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Button onClick={addBillRow} variant="outline" className="mt-4">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Row
                    </Button>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Payment & Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Items</p>
                        <p className="text-2xl font-bold">{billItems.length}</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Quantity</p>
                        <p className="text-2xl font-bold">{summary.totalQty}</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Grand Total</p>
                        <p className="text-2xl font-bold">${summary.grandTotal.toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-lg border space-y-2">
                        <Label htmlFor="paymentGiven">Payment Given</Label>
                        <Input id="paymentGiven" type="number" value={paymentGiven} onChange={(e) => setPaymentGiven(parseFloat(e.target.value) || 0)} placeholder="0.00"/>
                        <p className="text-lg font-semibold">Remaining: <span className="text-destructive">${summary.remaining.toFixed(2)}</span></p>
                    </div>
                </CardContent>
            </Card>
        </CardContent>
      </Card>
    </div>
  );
}
