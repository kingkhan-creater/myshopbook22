'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  increment,
  addDoc,
  getDocs,
  where,
  limit,
  runTransaction,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Pencil, Loader2, UserPlus, Camera, Package } from 'lucide-react';
import type { Item, Customer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';


const itemSchema = z.object({
  name: z.string().min(2, { message: 'Item name is required.' }),
  purchasePrice: z.coerce.number().min(0, { message: 'Purchase price must be a positive number.' }),
  salePrice: z.coerce.number().min(0, { message: 'Sale price must be a positive number.' }),
  stockQty: z.coerce.number().int().min(0, { message: 'Stock quantity must be a whole number.' }),
});
type ItemFormValues = z.infer<typeof itemSchema>;

const customerSchema = z.object({
    name: z.string().min(2, { message: "Customer name is required." }),
    phone: z.string().optional(),
    address: z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerSchema>;

type SaleBillItem = {
    rowId: string;
    itemId: string;
    itemName: string;
    qty: number;
    rate: number;
    discount: number;
    stock: number;
};

export default function ItemsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  
  // Sell dialog specific states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [saleItems, setSaleItems] = useState<SaleBillItem[]>([]);
  const [paymentGiven, setPaymentGiven] = useState(0);
  const [isSavingSale, setIsSavingSale] = useState(false);

  const form = useForm<ItemFormValues>({ 
    resolver: zodResolver(itemSchema),
    defaultValues: {
        name: '',
        purchasePrice: 0,
        salePrice: 0,
        stockQty: 0
    } 
  });
  const addCustomerForm = useForm<CustomerFormValues>({ 
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
    }
  });

  // Fetch Items in real-time
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const itemsQuery = query(collection(db, 'users', user.uid, 'items'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
        const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));
        setItems(itemsData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching items:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not fetch your items." });
        setLoading(false);
    });
    return () => unsubscribe();
  }, [user, toast]);

  // Fetch Customers when Sell Dialog opens
  useEffect(() => {
    if (isSellDialogOpen && user) {
        setLoadingCustomers(true);
        const custQuery = query(collection(db, 'users', user.uid, 'customers'), orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(custQuery, (snapshot) => {
            setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
            setLoadingCustomers(false);
        });
        return () => unsubscribe();
    }
  }, [isSellDialogOpen, user]);
  
  // Memoized and sorted item list for owner view
  const displayedItems = useMemo(() => {
    return [...items].sort((a, b) => {
        if (a.stockQty > 0 && b.stockQty === 0) return -1;
        if (a.stockQty === 0 && b.stockQty > 0) return 1;
        const timeA = a.createdAt?.toMillis() ?? 0;
        const timeB = b.createdAt?.toMillis() ?? 0;
        return timeB - timeA;
    });
  }, [items]);

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setPhotoBase64(item.photoBase64 || null);
    form.reset({
        name: item.name,
        purchasePrice: item.purchasePrice,
        salePrice: item.salePrice,
        stockQty: item.stockQty,
    });
    setIsFormOpen(true);
  }

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (!e.target?.result) return;
        const img = document.createElement('img');
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 512;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height = (height * MAX_WIDTH) / width;
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setPhotoBase64(dataUrl);
        };
        img.src = e.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: ItemFormValues) => {
    if (!user || !editingItem) return;
    try {
        const itemDoc = doc(db, 'users', user.uid, 'items', editingItem.id);
        const dataToUpdate: any = { ...values };
        if (photoBase64) {
          dataToUpdate.photoBase64 = photoBase64;
        }
        await updateDoc(itemDoc, dataToUpdate);
        toast({ title: "Item Updated", description: "Your item has been successfully updated." });
        setIsFormOpen(false);
        setEditingItem(null);
        setPhotoBase64(null);
    } catch(error) {
        toast({ variant: "destructive", title: "Error", description: `Could not save the item.` });
    }
  };

  const openSellDialog = () => {
    setSelectedCustomerId('');
    setSaleItems([]);
    setPaymentGiven(0);
    setIsSavingSale(false);
    setIsSellDialogOpen(true);
  }
  
  const handleAddSaleItemRow = () => {
    setSaleItems([...saleItems, { rowId: Date.now().toString(), itemId: '', itemName: '', qty: 1, rate: 0, discount: 0, stock: 0 }]);
  };

  const handleSaleItemChange = (rowId: string, field: keyof SaleBillItem, value: any) => {
    setSaleItems(saleItems.map(item => {
        if (item.rowId === rowId) {
            const updated = { ...item, [field]: value };
            if (field === 'itemId') {
                const selected = items.find(i => i.id === value);
                if (selected) {
                  updated.itemName = selected.name;
                  updated.rate = selected.salePrice;
                  updated.stock = selected.stockQty;
                }
            }
            if (field === 'qty' && Number(value) > updated.stock) {
                toast({ variant: 'destructive', title: 'Stock Limit Exceeded', description: `Only ${updated.stock} units available.`});
                updated.qty = updated.stock;
            }
            return updated;
        }
        return item;
    }));
  };

  const handleRemoveSaleItemRow = (rowId: string) => setSaleItems(saleItems.filter(item => item.rowId !== rowId));

  const saleSummary = useMemo(() => {
    const itemsTotal = saleItems.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0) - (Number(item.discount) || 0), 0);
    return { itemsTotal, remaining: itemsTotal - (Number(paymentGiven) || 0) };
  }, [saleItems, paymentGiven]);

  const handleSaveCustomer = async (values: CustomerFormValues) => {
    if (!user) return;
    addCustomerForm.control.disabled = true;
    try {
        const newCustomerRef = await addDoc(collection(db, 'users', user.uid, 'customers'), {
            ...values, totalCredit: 0, totalPaid: 0, createdAt: serverTimestamp(),
        });
        toast({ title: "Customer Added" });
        setSelectedCustomerId(newCustomerRef.id);
        setIsAddCustomerDialogOpen(false);
        addCustomerForm.reset();
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not add customer.' });
    } finally {
        addCustomerForm.control.disabled = false;
    }
  }

  const handleSaveSale = async () => {
    if (!user || !selectedCustomerId || saleItems.length === 0 || saleItems.some(i => !i.itemId || i.qty <= 0)) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a customer and add valid items with a quantity greater than 0.'});
        return;
    }
    setIsSavingSale(true);
    
    const userBillsRef = collection(db, 'users', user.uid, 'bills');
    const openBillQuery = query(userBillsRef, where('customerId', '==', selectedCustomerId), where('status', '==', 'OPEN'), limit(1));

    try {
        const openBillSnapshot = await getDocs(openBillQuery);
        let billRef: any;

        if (openBillSnapshot.empty) {
            billRef = doc(userBillsRef); 
        } else {
            billRef = openBillSnapshot.docs[0].ref;
        }

        await runTransaction(db, async (transaction) => {
            const customerRef = doc(db, 'users', user.uid, 'customers', selectedCustomerId);
            const itemRefs = saleItems.map(item => doc(db, 'users', user.uid, 'items', item.itemId));
            
            const [billSnap, customerSnap, ...itemSnaps] = await Promise.all([
                transaction.get(billRef),
                transaction.get(customerRef),
                ...itemRefs.map(ref => transaction.get(ref))
            ]);

            if (!customerSnap.exists()) throw new Error("Customer not found.");
            for (let i = 0; i < saleItems.length; i++) {
                const itemSnap = itemSnaps[i];
                if (!itemSnap.exists() || itemSnap.data().stockQty < saleItems[i].qty) {
                    throw new Error(`Not enough stock for ${saleItems[i].itemName}.`);
                }
            }

            let newItemsTotalForThisSale = 0;
            const billItemsToAdd = saleItems.map(item => {
                const total = (item.qty * item.rate) - (item.discount || 0);
                newItemsTotalForThisSale += total;
                return {
                    itemId: item.itemId,
                    itemName: item.itemName,
                    qty: item.qty,
                    rate: item.rate,
                    discount: item.discount || 0,
                    total: total,
                };
            });
            const paymentAmount = paymentGiven || 0;

            if (!billSnap.exists()) {
                const customerData = customerSnap.data() as Customer;
                const previousBalance = (customerData.totalCredit || 0) - (customerData.totalPaid || 0);
                transaction.set(billRef, {
                    id: billRef.id,
                    customerId: selectedCustomerId,
                    billNumber: Date.now().toString().slice(-6),
                    status: 'OPEN',
                    previousBalance: previousBalance,
                    itemsTotal: newItemsTotalForThisSale,
                    totalPaid: paymentAmount,
                    grandTotal: previousBalance + newItemsTotalForThisSale,
                    remaining: (previousBalance + newItemsTotalForThisSale) - paymentAmount,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            } else {
                transaction.update(billRef, {
                    itemsTotal: increment(newItemsTotalForThisSale),
                    totalPaid: increment(paymentAmount),
                    grandTotal: increment(newItemsTotalForThisSale),
                    remaining: increment(newItemsTotalForThisSale - paymentAmount),
                    updatedAt: serverTimestamp(),
                });
            }

            for (let i = 0; i < saleItems.length; i++) {
                transaction.update(itemRefs[i], { stockQty: increment(-saleItems[i].qty) });
            }

            const itemsSubcollectionRef = collection(billRef, 'items');
            for(const billItem of billItemsToAdd) {
                const newItemRef = doc(itemsSubcollectionRef);
                transaction.set(newItemRef, billItem);
            }
            
            if (paymentAmount > 0) {
                const paymentsSubcollectionRef = collection(billRef, 'payments');
                const newPaymentRef = doc(paymentsSubcollectionRef);
                transaction.set(newPaymentRef, {
                    amount: paymentAmount,
                    method: 'Cash', 
                    createdAt: serverTimestamp(),
                });
            }
            
            transaction.update(customerRef, {
                totalCredit: increment(newItemsTotalForThisSale),
                totalPaid: increment(paymentAmount)
            });
        });
        
        toast({ title: "Sale Saved!", description: "The bill has been updated." });
        setIsSellDialogOpen(false);
    } catch (e: any) {
        console.error("Transaction Failed:", e);
        toast({ variant: 'destructive', title: "Transaction Failed", description: e.message || "Could not save sale." });
    } finally {
        setIsSavingSale(false);
    }
  }
  
  const ItemCard = ({ item }: { item: Item }) => (
    <Card className="flex flex-col">
        <CardContent className="p-4 flex-grow">
            {item.photoBase64 ? (
                <div className="relative w-full h-32 mb-4 rounded-md overflow-hidden">
                    <Image src={item.photoBase64} alt={item.name} layout="fill" objectFit="cover" />
                </div>
            ) : (
              <div className="relative w-full h-32 mb-4 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <h3 className="font-semibold text-lg line-clamp-1">{item.name}</h3>
            <div className="text-sm text-muted-foreground mt-1">
                <p>Available Stock: <span className="font-bold text-foreground">{item.stockQty}</span></p>
            </div>
             <div className="mt-2 pt-2 border-t space-y-1">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Selling Price</span>
                    <p className="text-lg font-bold text-primary">${item.salePrice.toFixed(2)}</p>
                </div>
                <div className="flex justify-between items-center opacity-70">
                    <span className="text-xs text-muted-foreground uppercase">Purchase Cost</span>
                    <p className="text-sm font-semibold">${item.purchasePrice.toFixed(2)}</p>
                </div>
            </div>
        </CardContent>
        <CardFooter className="p-2 border-t">
            <div className="w-full flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => handleEditItem(item)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={openSellDialog}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Sell
                </Button>
            </div>
        </CardFooter>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Available Items</h1>
         <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard/items/new">
                <PlusCircle className="mr-2 h-4 w-4" /> Add/Purchase Items
            </Link>
          </Button>
      </div>
      
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : displayedItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {displayedItems.map((item) => <ItemCard key={item.id} item={item} />)}
        </div>
      ) : (
        <Card className="col-span-full flex items-center justify-center h-64 border-dashed">
          <CardContent className="text-center">
            <p className="text-lg font-semibold">No items in inventory.</p>
            <p className="text-muted-foreground">Use the "Add/Purchase Items" page to add stock.</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Item Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Edit Item</DialogTitle><DialogDescription>Update the details for this item.</DialogDescription></DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Item Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="purchasePrice" render={({ field }) => ( <FormItem><FormLabel>Purchase Price</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="salePrice" render={({ field }) => ( <FormItem><FormLabel>Sale Price</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="stockQty" render={({ field }) => ( <FormItem><FormLabel>Stock Quantity</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormItem>
                            <FormLabel>Item Photo</FormLabel>
                            <FormControl>
                                <div className="relative">
                                  <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input type="file" accept="image/*" onChange={handlePhotoChange} className="pl-10" />
                                </div>
                            </FormControl>
                            {photoBase64 && <div className="mt-2"><Image src={photoBase64} alt="Preview" width={80} height={80} className="rounded-md"/></div>}
                        </FormItem>
                        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit">Save Changes</Button></DialogFooter>
                    </form>
                </Form>
            </DialogContent>
      </Dialog>
      
      {/* Sell Item Dialog */}
      <Dialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Sale Bill</DialogTitle><DialogDescription>Select a customer and add items to sell.</DialogDescription></DialogHeader>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 py-4">
                    <div className="lg:col-span-2 space-y-4">
                        <Card><CardHeader className="p-4"><CardTitle className="text-lg">Customer</CardTitle></CardHeader>
                            <CardContent className="p-4 pt-0">
                                {loadingCustomers ? <p>Loading...</p> : (
                                    <div className="flex items-center gap-2">
                                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                                        <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}><DialogTrigger asChild><Button variant="outline" size="icon"><UserPlus/></Button></DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
                                                <Form {...addCustomerForm}><form onSubmit={addCustomerForm.handleSubmit(handleSaveCustomer)} className="space-y-4">
                                                    <FormField control={addCustomerForm.control} name="name" render={({field}) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                    <FormField control={addCustomerForm.control} name="phone" render={({field}) => ( <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem> )}/>
                                                    <FormField control={addCustomerForm.control} name="address" render={({field}) => ( <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem> )}/>
                                                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit" disabled={addCustomerForm.formState.isSubmitting}>Save</Button></DialogFooter>
                                                </form></Form>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        <Card><CardHeader className="p-4"><CardTitle className="text-lg">Payment</CardTitle></CardHeader>
                            <CardContent className="space-y-4 p-4 pt-0">
                                <div className="text-center p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground">Grand Total</p><p className="text-2xl font-bold">${saleSummary.itemsTotal.toFixed(2)}</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="paymentGiven">Payment Received</Label>
                                    <Input id="paymentGiven" type="number" value={paymentGiven} onChange={(e) => setPaymentGiven(parseFloat(e.target.value) || 0)} placeholder="0.00"/>
                                    <p className="text-lg font-semibold">Remaining: <span className="text-destructive">${saleSummary.remaining.toFixed(2)}</span></p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="lg:col-span-3">
                        <Card><CardHeader className="p-4"><CardTitle className="text-lg">Bill Items</CardTitle></CardHeader>
                            <CardContent className="p-0 sm:p-4">
                                <div className="overflow-x-auto">
                                    <Table><TableHeader><TableRow><TableHead className="min-w-[150px]">Item</TableHead><TableHead className="min-w-[80px]">Qty</TableHead><TableHead className="min-w-[80px]">Rate</TableHead><TableHead className="min-w-[100px]">Subtotal</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {saleItems.map(item => (
                                                <TableRow key={item.rowId}>
                                                    <TableCell>{item.itemName || (<Select value={item.itemId} onValueChange={(v) => handleSaleItemChange(item.rowId, 'itemId', v)}><SelectTrigger className="h-8"><SelectValue placeholder="Select Item"/></SelectTrigger><SelectContent>{items.filter(i=>i.stockQty > 0).map(i => <SelectItem key={i.id} value={i.id}>{i.name} (Qty: {i.stockQty})</SelectItem>)}</SelectContent></Select>)}</TableCell>
                                                    <TableCell><Input type="number" value={item.qty} onChange={e => handleSaleItemChange(item.rowId, 'qty', parseInt(e.target.value) || 0)} className="w-16 h-8"/></TableCell>
                                                    <TableCell><Input type="number" value={item.rate} onChange={e => handleSaleItemChange(item.rowId, 'rate', parseFloat(e.target.value) || 0)} className="w-20 h-8"/></TableCell>
                                                    <TableCell className="text-sm font-medium">${((item.qty * item.rate) - (item.discount || 0)).toFixed(2)}</TableCell>
                                                    <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveSaleItemRow(item.rowId)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="p-4 border-t">
                                    <Button onClick={handleAddSaleItemRow} variant="outline" size="sm" className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4"/>Add Item
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
                <DialogFooter className="flex flex-col sm:flex-row gap-2">
                    <DialogClose asChild><Button variant="outline" className="w-full sm:w-auto">Cancel</Button></DialogClose>
                    <Button onClick={handleSaveSale} disabled={isSavingSale} className="w-full sm:w-auto">
                        {isSavingSale && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Confirm Sale
                    </Button>
                </DialogFooter>
            </DialogContent>
      </Dialog>
    </div>
  );
}