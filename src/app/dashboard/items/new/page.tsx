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
  sellingPrice: number;
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
        sellingPrice: 0,
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
                updatedItem.sellingPrice = selectedItem.salePrice;
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
                const newItemRef = doc(userItemsRef);
                batch.set(newItemRef, {
                    name: billItem.itemName,
                    purchasePrice: billItem.price,
                    salePrice: billItem.sellingPrice,
                    stockQty: billItem.qty,
                    createdAt: serverTimestamp(),
                    supplier: selectedSupplierId
                });
            } else {
                const itemRef = doc(db, 'users', user.uid, 'items', billItem.itemId);
                batch.update(itemRef, { 
                    stockQty: increment(billItem.qty),
                    purchasePrice: billItem.price,
                    salePrice: billItem.sellingPrice
                });
            }
        }
        
        const supplierRef = doc(db, 'users', user.uid, 'suppliers', selectedSupplierId);
        batch.update(supplierRef, {
            totalPurchase: increment(summary.grandTotal),
            totalPaid: increment(paymentGiven)
        });

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
    <div className="container mx-auto p-2 sm:p-6 lg:p-8">
      <Card className="border-none sm:border shadow-none sm:shadow-sm">
        <CardHeader className="px-4 py-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
               <Button variant="outline" size="icon" asChild className="h-8 w-8 sm:h-10 sm:w-10">
                <Link href="/dashboard/items"><ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /></Link>
               </Button>
               <div>
                <CardTitle className="text-xl sm:text-3xl font-bold tracking-tight">New Purchase Bill</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Add items to inventory from a supplier.</CardDescription>
               </div>
            </div>
            <Button onClick={handleSaveBill} disabled={isSaving} className="w-full sm:w-auto h-10">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 px-2 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-base sm:text-lg">Supplier Details</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                    {loading ? <div className="h-10 w-full bg-muted animate-pulse rounded" /> : (
                         <div className="flex items-center gap-2">
                             <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Select a supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                             <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"><UserPlus className="h-4 w-4"/></Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
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
                                                <Button type="submit">Save Supplier</Button>
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
                <CardHeader className="p-4">
                    <CardTitle className="text-base sm:text-lg">Bill Items</CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-4">
                    <div className="overflow-x-auto w-full">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-[180px] sm:min-w-[200px]">Item</TableHead>
                                    <TableHead className="min-w-[80px]">Qty</TableHead>
                                    <TableHead className="min-w-[100px]">Purchase Price</TableHead>
                                    <TableHead className="min-w-[100px]">Selling Price</TableHead>
                                    <TableHead className="min-w-[100px]">Subtotal</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {billItems.map(item => (
                                    <TableRow key={item.rowId}>
                                        <TableCell className="py-2">
                                            <Select
                                              value={item.itemId}
                                              onValueChange={(value) => handleBillItemChange(item.rowId, 'itemId', value)}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Select item" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new">-- Create New Item --</SelectItem>
                                                    {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            {item.itemId === 'new' && (
                                                <Input 
                                                    placeholder="Item name"
                                                    className="mt-2 h-8 text-xs sm:text-sm"
                                                    value={item.itemName}
                                                    onChange={(e) => handleBillItemChange(item.rowId, 'itemName', e.target.value)}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <Input type="number" className="h-9 w-full min-w-[60px]" value={item.qty} onChange={(e) => handleBillItemChange(item.rowId, 'qty', parseInt(e.target.value) || 0)} />
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <Input type="number" className="h-9 w-full min-w-[80px]" value={item.price} onChange={(e) => handleBillItemChange(item.rowId, 'price', parseFloat(e.target.value) || 0)} />
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <Input type="number" className="h-9 w-full min-w-[80px]" value={item.sellingPrice} onChange={(e) => handleBillItemChange(item.rowId, 'sellingPrice', parseFloat(e.target.value) || 0)} />
                                        </TableCell>
                                        <TableCell className="py-2 font-medium text-sm">
                                            ${(item.qty * item.price).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeBillRow(item.rowId)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="p-4 border-t">
                        <Button onClick={addBillRow} variant="outline" size="sm" className="w-full sm:w-auto">
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                        </Button>
                    </div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-base sm:text-lg">Payment & Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-4 pt-0">
                    <div className="text-center p-3 bg-muted rounded-lg flex flex-col justify-center">
                        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Items</p>
                        <p className="text-lg sm:text-2xl font-bold">{billItems.length}</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg flex flex-col justify-center">
                        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Quantity</p>
                        <p className="text-lg sm:text-2xl font-bold">{summary.totalQty}</p>
                    </div>
                    <div className="text-center p-3 bg-primary text-primary-foreground rounded-lg flex flex-col justify-center shadow-sm">
                        <p className="text-[10px] sm:text-xs opacity-80 uppercase tracking-wider font-semibold">Grand Total</p>
                        <p className="text-lg sm:text-2xl font-bold">${summary.grandTotal.toFixed(2)}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-background space-y-2">
                        <div className="space-y-1">
                            <Label htmlFor="paymentGiven" className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Payment Given</Label>
                            <Input id="paymentGiven" type="number" className="h-9" value={paymentGiven} onChange={(e) => setPaymentGiven(parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-xs font-semibold">Remaining:</span>
                            <span className="text-sm font-bold text-destructive">${summary.remaining.toFixed(2)}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </CardContent>
      </Card>
    </div>
  );
}