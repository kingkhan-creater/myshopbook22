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
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  writeBatch,
  increment,
  addDoc,
  getDocs,
  where,
  limit,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog"
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Pencil, Trash2, Loader2, ShoppingCart, DollarSign, UserPlus } from 'lucide-react';
import type { Item, Customer, CustomerBill, CustomerBillItem, Payment } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

const itemSchema = z.object({
  name: z.string().min(2, { message: 'Item name is required.' }),
  purchasePrice: z.coerce.number().min(0, { message: 'Purchase price must be a positive number.' }),
  salePrice: z.coerce.number().min(0, { message: 'Sale price must be a positive number.' }),
  stockQty: z.coerce.number().int().min(0, { message: 'Stock quantity must be a whole number.' }),
  supplier: z.string().optional(),
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
    stock: number;
};

export default function ItemsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // States for Sell Dialog
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [saleItems, setSaleItems] = useState<SaleBillItem[]>([]);
  const [paymentGiven, setPaymentGiven] = useState(0);
  const [isSavingSale, setIsSavingSale] = useState(false);

  const editItemForm = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
  });

  const addCustomerForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

  // Fetch Items
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const itemsCollection = collection(db, 'users', user.uid, 'items');
    const q = query(itemsCollection, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));
        // Client-side sort: out of stock items at the bottom
        itemsData.sort((a, b) => {
            if (a.stockQty > 0 && b.stockQty === 0) return -1;
            if (a.stockQty === 0 && b.stockQty > 0) return 1;
            return 0; // Keep original (date) order otherwise
        });
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
        const custCollection = collection(db, 'users', user.uid, 'customers');
        const q = query(custCollection, orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
            setLoadingCustomers(false);
        });
        return () => unsubscribe();
    }
  }, [isSellDialogOpen, user]);


  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    editItemForm.reset(item);
    setIsFormOpen(true);
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!user) return;
    try {
        await deleteDoc(doc(db, 'users', user.uid, 'items', itemId));
        toast({ title: "Item Deleted", description: "The item has been successfully removed." });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not delete the item." });
    }
  }

  const onUpdateItemSubmit = async (values: ItemFormValues) => {
    if (!user || !editingItem) return;
    try {
        const itemDoc = doc(db, 'users', user.uid, 'items', editingItem.id);
        await updateDoc(itemDoc, values);
        toast({ title: "Item Updated", description: "Your item has been successfully updated." });
        setIsFormOpen(false);
        setEditingItem(null);
    } catch(error) {
        toast({ variant: "destructive", title: "Error", description: `Could not save the item.` });
    }
  };
  
  // --- Sell Dialog Logic ---
  const handleOpenSellDialog = () => {
    // Reset state from previous sale
    setSelectedCustomerId('');
    setSaleItems([]);
    setPaymentGiven(0);
    setIsSellDialogOpen(true);
  };

  const handleAddSaleItemRow = () => {
    const availableItems = items.filter(i => i.stockQty > 0);
    if(availableItems.length === 0) {
        toast({variant: 'destructive', title: 'No stock available', description: 'Cannot add items to sell.'});
        return;
    }
    setSaleItems([...saleItems, {
        rowId: Date.now().toString(),
        itemId: '',
        itemName: '',
        qty: 1,
        rate: 0,
        stock: 0
    }]);
  };

  const handleRemoveSaleItemRow = (rowId: string) => {
    setSaleItems(saleItems.filter(item => item.rowId !== rowId));
  };

  const handleSaleItemChange = <K extends keyof SaleBillItem>(rowId: string, field: K, value: SaleBillItem[K]) => {
    setSaleItems(saleItems.map(item => {
        if (item.rowId === rowId) {
            const updatedItem = { ...item, [field]: value };
            if (field === 'itemId') {
                const selectedItem = items.find(i => i.id === value);
                if (selectedItem) {
                    updatedItem.itemName = selectedItem.name;
                    updatedItem.rate = selectedItem.salePrice;
                    updatedItem.stock = selectedItem.stockQty;
                }
            }
            if (field === 'qty') {
                if (Number(value) > item.stock) {
                    toast({ variant: 'destructive', title: 'Stock limit reached', description: `Only ${item.stock} units available.`});
                    updatedItem.qty = item.stock;
                }
            }
            return updatedItem;
        }
        return item;
    }));
  };

  const saleSummary = useMemo(() => {
    const grandTotal = saleItems.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);
    const remaining = grandTotal - (Number(paymentGiven) || 0);
    return {
        totalItems: saleItems.length,
        totalQty: saleItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
        grandTotal,
        remaining,
    };
  }, [saleItems, paymentGiven]);


  const handleSaveCustomer = async (values: CustomerFormValues) => {
    if (!user) return;
    addCustomerForm.control.disabled = true;
    try {
        const newCustomerRef = await addDoc(collection(db, 'users', user.uid, 'customers'), {
            ...values,
            totalCredit: 0,
            totalPaid: 0,
            createdAt: serverTimestamp(),
        });
        toast({ title: "Customer Added", description: `${values.name} has been added successfully.` });
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
    if (!user) return;
    if (!selectedCustomerId) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a customer.'});
        return;
    }
    if (saleItems.length === 0 || saleItems.some(i => !i.itemId || i.qty <= 0)) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please add valid items and quantities to the bill.'});
        return;
    }
    
    setIsSavingSale(true);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Find the customer's open bill
            const openBillQuery = query(
                collection(db, 'users', user.uid, 'customers', selectedCustomerId, 'bills'),
                where('status', '==', 'OPEN'),
                limit(1)
            );
            const openBillSnapshot = await getDocs(openBillQuery);
            const openBillDoc = openBillSnapshot.docs.length > 0 ? openBillSnapshot.docs[0] : null;

            // 2. Prepare item updates and check stock
            for (const item of saleItems) {
                const itemRef = doc(db, 'users', user.uid, 'items', item.itemId);
                const itemSnap = await transaction.get(itemRef);
                if (!itemSnap.exists() || itemSnap.data().stockQty < item.qty) {
                    throw new Error(`Not enough stock for ${item.itemName}.`);
                }
                transaction.update(itemRef, { stockQty: increment(-item.qty) });
            }

            // 3. Prepare bill update/creation
            const newBillItems: CustomerBillItem[] = saleItems.map(({ itemId, itemName, qty, rate }) => ({ itemId, itemName, qty, rate }));
            const newPayment: Payment | null = paymentGiven > 0 ? { amount: paymentGiven, date: serverTimestamp(), method: 'Cash' } : null;

            if (openBillDoc) {
                // Update existing open bill
                const billRef = openBillDoc.ref;
                const billData = openBillDoc.data() as CustomerBill;
                const updatedItems = [...billData.items, ...newBillItems];
                const updatedPayments = newPayment ? [...billData.payments, newPayment] : billData.payments;
                
                transaction.update(billRef, {
                    items: updatedItems,
                    payments: updatedPayments,
                    totalAmount: billData.totalAmount + saleSummary.grandTotal,
                    totalPaid: billData.totalPaid + (paymentGiven || 0),
                    updatedAt: serverTimestamp()
                });
            } else {
                // Create a new open bill
                const billRef = doc(collection(db, 'users', user.uid, 'customers', selectedCustomerId, 'bills'));
                const customerRef = doc(db, 'users', user.uid, 'customers', selectedCustomerId);
                const customerSnap = await transaction.get(customerRef);
                const customerData = customerSnap.data() as Customer;
                const previousBalance = (customerData.totalCredit || 0) - (customerData.totalPaid || 0);

                const newBill: Omit<CustomerBill, 'id'> = {
                    billNumber: Date.now().toString().slice(-6),
                    status: 'OPEN',
                    items: newBillItems,
                    payments: newPayment ? [newPayment] : [],
                    previousBalance: previousBalance,
                    totalAmount: saleSummary.grandTotal,
                    totalPaid: paymentGiven || 0,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };
                transaction.set(billRef, newBill);
            }

            // 4. Update customer totals
            const customerRef = doc(db, 'users', user.uid, 'customers', selectedCustomerId);
            transaction.update(customerRef, {
                totalCredit: increment(saleSummary.grandTotal),
                totalPaid: increment(paymentGiven || 0)
            });
        });

        toast({ title: "Sale Saved!", description: "The bill has been updated successfully." });
        setIsSellDialogOpen(false);
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Transaction Failed", description: e.message || "Could not save the sale." });
    } finally {
        setIsSavingSale(false);
    }
  }


  const totalStockValue = useMemo(() => {
    return items.reduce((total, item) => total + (item.purchasePrice * item.stockQty), 0);
  }, [items]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">Available Items</CardTitle>
              <CardDescription>Manage your inventory and view stock levels.</CardDescription>
            </div>
            <div className="flex gap-2">
                <Button asChild>
                    <Link href="/dashboard/items/purchase">
                        <ShoppingCart className="mr-2 h-4 w-4" /> Purchase Items
                    </Link>
                </Button>
                <Button variant="secondary" onClick={handleOpenSellDialog}>
                    <DollarSign className="mr-2 h-4 w-4" /> Sell Items
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Card className="mb-4">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Inventory Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold">${totalStockValue.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Total Stock Value</p>
                </CardContent>
            </Card>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Purchase Price</TableHead>
                  <TableHead>Sale Price</TableHead>
                  <TableHead>Stock Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : items.length > 0 ? (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.stockQty}</TableCell>
                      <TableCell>${item.purchasePrice.toFixed(2)}</TableCell>
                      <TableCell>${item.salePrice.toFixed(2)}</TableCell>
                      <TableCell>${(item.purchasePrice * item.stockQty).toFixed(2)}</TableCell>
                      <TableCell>
                        {item.stockQty < 5 ? (
                           <Badge variant={item.stockQty === 0 ? 'destructive' : 'secondary'}>
                              {item.stockQty === 0 ? 'Out of Stock' : 'Low Stock'}
                           </Badge>
                        ): (
                          <Badge variant="default">In Stock</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                          <div className="flex gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                                  <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                      <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteItem(item.id)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                              </AlertDialog>
                          </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center">No items found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Item Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
                <DialogTitle>Edit Item</DialogTitle>
                <DialogDescription>Update the details of your item.</DialogDescription>
            </DialogHeader>
            <Form {...editItemForm}>
                <form onSubmit={editItemForm.handleSubmit(onUpdateItemSubmit)} className="space-y-4">
                <FormField control={editItemForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Item Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={editItemForm.control} name="purchasePrice" render={({ field }) => ( <FormItem><FormLabel>Purchase Price</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={editItemForm.control} name="salePrice" render={({ field }) => ( <FormItem><FormLabel>Sale Price</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                <FormField control={editItemForm.control} name="stockQty" render={({ field }) => ( <FormItem><FormLabel>Stock Quantity</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={editItemForm.control} name="supplier" render={({ field }) => ( <FormItem><FormLabel>Supplier</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit">Save Changes</Button>
                </DialogFooter>
                </form>
            </Form>
            </DialogContent>
        </Dialog>

        {/* Sell Item Dialog */}
        <Dialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Create Sale Bill</DialogTitle>
                    <DialogDescription>Select a customer and add items to sell.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-5 gap-6 py-4">
                    <div className="col-span-2 space-y-4">
                        <Card>
                            <CardHeader><CardTitle className="text-lg">Customer</CardTitle></CardHeader>
                            <CardContent>
                                {loadingCustomers ? <p>Loading...</p> : (
                                    <div className="flex items-center gap-2">
                                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                                            <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                                            <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
                                            <DialogTrigger asChild><Button variant="outline" size="icon"><UserPlus/></Button></DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
                                                <Form {...addCustomerForm}>
                                                    <form onSubmit={addCustomerForm.handleSubmit(handleSaveCustomer)} className="space-y-4">
                                                        <FormField control={addCustomerForm.control} name="name" render={({field}) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                        <FormField control={addCustomerForm.control} name="phone" render={({field}) => ( <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                        <FormField control={addCustomerForm.control} name="address" render={({field}) => ( <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                                        <DialogFooter>
                                                            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                                            <Button type="submit" disabled={addCustomerForm.control.disabled}>Save</Button>
                                                        </DialogFooter>
                                                    </form>
                                                </Form>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-lg">Payment</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-center p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground">Grand Total</p>
                                    <p className="text-2xl font-bold">${saleSummary.grandTotal.toFixed(2)}</p>
                                </div>
                                <div className="space-y-2">
                                    <FormLabel htmlFor="paymentGiven">Payment Received</FormLabel>
                                    <Input id="paymentGiven" type="number" value={paymentGiven} onChange={(e) => setPaymentGiven(parseFloat(e.target.value) || 0)} placeholder="0.00"/>
                                    <p className="text-lg font-semibold">Remaining: <span className="text-destructive">${saleSummary.remaining.toFixed(2)}</span></p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="col-span-3">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Bill Items</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[45%]">Item</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Rate</TableHead>
                                            <TableHead>Subtotal</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {saleItems.map(item => (
                                            <TableRow key={item.rowId}>
                                                <TableCell>{item.itemName || (
                                                    <Select value={item.itemId} onValueChange={(v) => handleSaleItemChange(item.rowId, 'itemId', v)}>
                                                        <SelectTrigger><SelectValue placeholder="Select Item"/></SelectTrigger>
                                                        <SelectContent>{items.filter(i=>i.stockQty > 0).map(i => <SelectItem key={i.id} value={i.id}>{i.name} (Qty: {i.stockQty})</SelectItem>)}</SelectContent>
                                                    </Select>
                                                )}</TableCell>
                                                <TableCell><Input type="number" value={item.qty} onChange={e => handleSaleItemChange(item.rowId, 'qty', parseInt(e.target.value) || 0)}/></TableCell>
                                                <TableCell><Input type="number" value={item.rate} onChange={e => handleSaleItemChange(item.rowId, 'rate', parseFloat(e.target.value) || 0)}/></TableCell>
                                                <TableCell>${(item.qty * item.rate).toFixed(2)}</TableCell>
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
                        Save Sale
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}

    