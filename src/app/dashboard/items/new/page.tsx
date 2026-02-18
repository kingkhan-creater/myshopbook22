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
  }, [user]);

  const addBillRow = () => {
    setBillItems([
      ...billItems,
      {
        rowId: Date.now().toString(),
        itemId: '',
        itemName: '',
        qty: 1,
        price: 0,
        sellingPrice: 0,
      },
    ]);
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

  const handleSaveBill = async () => {
    if (!user || !selectedSupplierId || billItems.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Select a supplier and add items.' });
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
        
        batch.update(doc(db, 'users', user.uid, 'suppliers', selectedSupplierId), {
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
        toast({ title: 'Bill saved successfully' });
        router.push('/dashboard/items');
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-2 sm:p-6 lg:p-8">
      <Card className="border-none sm:border shadow-none">
        <CardHeader className="px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <Button variant="outline" size="icon" asChild><Link href="/dashboard/items"><ArrowLeft/></Link></Button>
               <div>
                <CardTitle className="text-xl sm:text-3xl font-bold">New Purchase Bill</CardTitle>
                <CardDescription>Restock your inventory from suppliers.</CardDescription>
               </div>
            </div>
            <Button onClick={handleSaveBill} disabled={isSaving} className="w-full sm:w-auto h-10">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-2 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Supplier</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                         <div className="flex items-center gap-2">
                             <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                <SelectTrigger><SelectValue placeholder="Select supplier"/></SelectTrigger>
                                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                             <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                                <DialogTrigger asChild><Button variant="outline" size="icon"><UserPlus/></Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
                                    <Form {...supplierForm}>
                                        <form onSubmit={supplierForm.handleSubmit(async (v) => {
                                            const ref = await addDoc(collection(db, 'users', user!.uid, 'suppliers'), { ...v, totalPurchase: 0, totalPaid: 0, createdAt: serverTimestamp() });
                                            setSelectedSupplierId(ref.id); setIsSupplierDialogOpen(false); supplierForm.reset();
                                        })} className="space-y-4">
                                            <FormField control={supplierForm.control} name="name" render={({field}) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={supplierForm.control} name="phone" render={({field}) => ( <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
                                        </form>
                                    </Form>
                                </DialogContent>
                             </Dialog>
                         </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="p-4"><CardTitle className="text-lg">Bill Items</CardTitle></CardHeader>
                <CardContent className="p-0 sm:p-4">
                    <div className="overflow-x-auto"><Table>
                        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Cost</TableHead><TableHead>Sale</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
                        <TableBody>
                            {billItems.map(item => (
                                <TableRow key={item.rowId}>
                                    <TableCell className="min-w-[180px]">
                                        <Select value={item.itemId} onValueChange={(v) => handleBillItemChange(item.rowId, 'itemId', v)}>
                                            <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                                            <SelectContent><SelectItem value="new">-- New Item --</SelectItem>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        {item.itemId === 'new' && <Input placeholder="Item name" className="mt-2 h-8" value={item.itemName} onChange={(e) => handleBillItemChange(item.rowId, 'itemName', e.target.value)} />}
                                    </TableCell>
                                    <TableCell><Input type="number" className="w-16 h-9" value={item.qty} onChange={(e) => handleBillItemChange(item.rowId, 'qty', parseInt(e.target.value) || 0)} /></TableCell>
                                    <TableCell><Input type="number" className="w-20 h-9" value={item.price} onChange={(e) => handleBillItemChange(item.rowId, 'price', parseFloat(e.target.value) || 0)} /></TableCell>
                                    <TableCell><Input type="number" className="w-20 h-9" value={item.sellingPrice} onChange={(e) => handleBillItemChange(item.rowId, 'sellingPrice', parseFloat(e.target.value) || 0)} /></TableCell>
                                    <TableCell className="text-sm font-medium">${(item.qty * item.price).toFixed(2)}</TableCell>
                                    <TableCell><Button variant="ghost" size="icon" onClick={() => setBillItems(billItems.filter(i => i.rowId !== item.rowId))}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table></div>
                    <div className="p-4 border-t"><Button onClick={addBillRow} variant="outline" size="sm" className="w-full sm:w-auto"><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button></div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader className="p-4"><CardTitle className="text-lg">Summary</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 pt-0">
                    <div className="text-center p-3 bg-muted rounded-lg"><p className="text-[10px] uppercase font-bold text-muted-foreground">Grand Total</p><p className="text-2xl font-bold">${summary.grandTotal.toFixed(2)}</p></div>
                    <div className="p-3 rounded-lg border bg-background space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Payment Given</Label>
                        <Input type="number" className="h-9" value={paymentGiven} onChange={(e) => setPaymentGiven(parseFloat(e.target.value) || 0)} />
                        <div className="flex justify-between items-center pt-1"><span className="text-xs font-semibold">Remaining:</span><span className="text-sm font-bold text-destructive">${summary.remaining.toFixed(2)}</span></div>
                    </div>
                </CardContent>
            </Card>
        </CardContent>
      </Card>
    </div>
  );
}
