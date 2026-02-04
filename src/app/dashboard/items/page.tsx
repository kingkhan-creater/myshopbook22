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
import { PlusCircle, Pencil, Trash2, Loader2, UserPlus, Camera, Package } from 'lucide-react';
import type { Item, Customer, CustomerBill } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import Link from 'next/link';

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
    if (!user || !selectedCustomerId || saleItems.length === 0 || saleItems.some(i => !i.itemId || i.qty <= 0 || i.rate <=0)) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a customer and add valid items with a quantity and rate greater than 0.'});
        return;
    }
    setIsSavingSale(true);
    try {
        await runTransaction(db, async (transaction) => {
            // 1. Update stock quantities for all sold items
            for (const item of saleItems) {
                const itemRef = doc(db, 'users', user.uid, 'items', item.itemId);
                const itemSnap = await transaction.get(itemRef);
                if (!itemSnap.exists() || itemSnap.data().stockQty < item.qty) {
                    throw new Error(`Not enough stock for ${item.itemName}.`);
                }
                transaction.update(itemRef, { stockQty: increment(-item.qty) });
            }

            // 2. Find the customer's open bill or prepare to create a new one
            const userBillsRef = collection(db, 'users', user.uid, 'bills');
            const openBillQuery = query(userBillsRef, where('customerId', '==', selectedCustomerId), where('status', '==', 'OPEN'), limit(1));
            const openBillSnapshot = await getDocs(openBillQuery);

            let billRef;
            let currentBillData;

            if (openBillSnapshot.docs.length > 0) {
                const openBillDoc = openBillSnapshot.docs[0];
                billRef = openBillDoc.ref;
                currentBillData = openBillDoc.data() as CustomerBill;
            } else {
                const customerRef = doc(db, 'users', user.uid, 'customers', selectedCustomerId);
                const customerSnap = await transaction.get(customerRef);
                const customerData = customerSnap.data() as Customer;
                const previousBalance = (customerData.totalCredit || 0) - (customerData.totalPaid || 0);

                billRef = doc(userBillsRef);
                currentBillData = {
                    id: billRef.id,
                    customerId: selectedCustomerId,
                    billNumber: Date.now().toString().slice(-6),
                    status: 'OPEN',
                    previousBalance: previousBalance,
                    itemsTotal: 0,
                    totalPaid: 0,
                    grandTotal: previousBalance,
                    remaining: previousBalance,
                    createdAt: serverTimestamp(),
                };
            }

            // 3. Add new items to the bill's subcollection
            const itemsSubcollectionRef = collection(billRef, 'items');
            for (const item of saleItems) {
                const newItemRef = doc(itemsSubcollectionRef);
                const total = (item.qty * item.rate) - (item.discount || 0);
                transaction.set(newItemRef, {
                    itemId: item.itemId,
                    itemName: item.itemName,
                    qty: item.qty,
                    rate: item.rate,
                    discount: item.discount || 0,
                    total: total,
                });
            }

            // 4. Add payment to the bill's subcollection, if provided
            const paymentAmount = paymentGiven || 0;
            if (paymentAmount > 0) {
                const paymentsSubcollectionRef = collection(billRef, 'payments');
                const newPaymentRef = doc(paymentsSubcollectionRef);
                transaction.set(newPaymentRef, {
                    amount: paymentAmount,
                    method: 'Cash', // Or get from form
                    createdAt: serverTimestamp(),
                });
            }
            
            const newItemsTotalForThisSale = saleItems.reduce((sum, item) => sum + ((item.qty * item.rate) - (item.discount || 0)), 0);

            const newItemsTotal = currentBillData.itemsTotal + newItemsTotalForThisSale;
            const newTotalPaid = currentBillData.totalPaid + paymentAmount;
            const newGrandTotal = currentBillData.previousBalance + newItemsTotal;

            const billUpdateData = {
                itemsTotal: newItemsTotal,
                totalPaid: newTotalPaid,
                grandTotal: newGrandTotal,
                remaining: newGrandTotal - newTotalPaid,
                updatedAt: serverTimestamp(),
            };

            if (openBillSnapshot.docs.length > 0) {
                transaction.update(billRef, billUpdateData);
            } else {
                transaction.set(billRef, { ...currentBillData, ...billUpdateData });
            }

            const customerRef = doc(db, 'users', user.uid, 'customers', selectedCustomerId);
            transaction.update(customerRef, {
                totalCredit: increment(newItemsTotalForThisSale),
                totalPaid: increment(paymentAmount)
            });
        });
        toast({ title: "Sale Saved!", description: "The bill has been updated." });
        setIsSellDialogOpen(false);
    } catch (e: any) {
        console.error(e);
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
            <h3 className="font-semibold text-lg">{item.name}</h3>
            <div className="text-sm text-muted-foreground mt-1">
                <p>Qty: <span className="font-medium text-foreground">{item.stockQty}</span></p>
            </div>
             <div className="mt-2">
                <p className="text-xl font-bold text-primary">${item.salePrice.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Cost: ${item.purchasePrice.toFixed(2)}</p>
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Available Items</h1>
         <Button asChild>
            <Link href="/dashboard/items/purchase">
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
                            {photoBase64 && <Image src={photoBase64} alt="Preview" width={80} height={80} className="mt-2 rounded-md"/>}
                        </FormItem>
                        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit">Save Changes</Button></DialogFooter>
                    </form>
                </Form>
            </DialogContent>
      </Dialog>
      
      {/* Sell Item Dialog */}
      <Dialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
            <DialogContent className="max-w-5xl">
                <DialogHeader><DialogTitle>Create Sale Bill</DialogTitle><DialogDescription>Select a customer and add items to sell.</DialogDescription></DialogHeader>
                <div className="grid grid-cols-5 gap-6 py-4">
                    <div className="col-span-2 space-y-4">
                        <Card><CardHeader><CardTitle className="text-lg">Customer</CardTitle></CardHeader>
                            <CardContent>
                                {loadingCustomers ? <p>Loading...</p> : (
                                    <div className="flex items-center gap-2">
                                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                                        <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}><DialogTrigger asChild><Button variant="outline" size="icon"><UserPlus/></Button></DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
                                                <Form {...addCustomerForm}><form onSubmit={addCustomerForm.handleSubmit(handleSaveCustomer)} className="space-y-4">
                                                    <FormField control={addCustomerForm.control} name="name" render={({field}) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                    <FormField control={addCustomerForm.control} name="phone" render={({field}) => ( <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                    <FormField control={addCustomerForm.control} name="address" render={({field}) => ( <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit" disabled={addCustomerForm.control.disabled}>Save</Button></DialogFooter>
                                                </form></Form>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        <Card><CardHeader><CardTitle className="text-lg">Payment</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
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
                    <div className="col-span-3">
                        <Card><CardHeader><CardTitle className="text-lg">Bill Items</CardTitle></CardHeader>
                            <CardContent>
                                <Table><TableHeader><TableRow><TableHead className="w-[35%]">Item</TableHead><TableHead>Qty</TableHead><TableHead>Rate</TableHead><TableHead>Discount</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {saleItems.map(item => (
                                            <TableRow key={item.rowId}>
                                                <TableCell>{item.itemName || (<Select value={item.itemId} onValueChange={(v) => handleSaleItemChange(item.rowId, 'itemId', v)}><SelectTrigger><SelectValue placeholder="Select Item"/></SelectTrigger><SelectContent>{items.filter(i=>i.stockQty > 0).map(i => <SelectItem key={i.id} value={i.id}>{i.name} (Qty: {i.stockQty})</SelectItem>)}</SelectContent></Select>)}</TableCell>
                                                <TableCell><Input type="number" value={item.qty} onChange={e => handleSaleItemChange(item.rowId, 'qty', parseInt(e.target.value) || 1)} className="w-16"/></TableCell>
                                                <TableCell><Input type="number" value={item.rate} onChange={e => handleSaleItemChange(item.rowId, 'rate', parseFloat(e.target.value) || 0)} className="w-20"/></TableCell>
                                                <TableCell><Input type="number" value={item.discount} onChange={e => handleSaleItemChange(item.rowId, 'discount', parseFloat(e.target.value) || 0)} className="w-20"/></TableCell>
                                                <TableCell>${((item.qty * item.rate) - (item.discount || 0)).toFixed(2)}</TableCell>
                                                <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveSaleItemRow(item.rowId)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <Button onClick={handleAddSaleItemRow} variant="outline" className="mt-4"><PlusCircle className="mr-2 h-4 w-4"/>Add Item</Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSaveSale} disabled={isSavingSale}>
                        {isSavingSale && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Confirm Sale
                    </Button>
                </DialogFooter>
            </DialogContent>
      </Dialog>
    </div>
  );
}
