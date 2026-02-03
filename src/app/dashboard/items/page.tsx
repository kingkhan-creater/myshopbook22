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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  DialogTrigger,
  DialogClose,
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
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { Item } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const itemSchema = z.object({
  name: z.string().min(2, { message: 'Item name is required.' }),
  purchasePrice: z.coerce.number().min(0, { message: 'Purchase price must be a positive number.' }),
  salePrice: z.coerce.number().min(0, { message: 'Sale price must be a positive number.' }),
  stockQty: z.coerce.number().int().min(0, { message: 'Stock quantity must be a whole number.' }),
  supplier: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

export default function ItemsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      purchasePrice: 0,
      salePrice: 0,
      stockQty: 0,
      supplier: '',
    },
  });

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const itemsCollection = collection(db, 'users', user.uid, 'items');
    const q = query(itemsCollection, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const itemsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Item));
        setItems(itemsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching items:", error);
        toast({
            variant: "destructive",
            title: "Error fetching data",
            description: "Could not fetch your items from Firestore."
        })
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, toast]);

  const handleAddNewItem = () => {
    setEditingItem(null);
    form.reset({ name: '', purchasePrice: 0, salePrice: 0, stockQty: 0, supplier: '' });
    setIsFormOpen(true);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    form.reset(item);
    setIsFormOpen(true);
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!user) return;
    try {
        const itemDoc = doc(db, 'users', user.uid, 'items', itemId);
        await deleteDoc(itemDoc);
        toast({
            title: "Item Deleted",
            description: "The item has been successfully removed.",
        })
    } catch (error) {
        console.error("Error deleting item:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not delete the item.",
        })
    }
  }

  const onSubmit = async (values: ItemFormValues) => {
    if (!user) return;

    form.control.disabled = true;

    try {
        if (editingItem) {
            // Update existing item
            const itemDoc = doc(db, 'users', user.uid, 'items', editingItem.id);
            await updateDoc(itemDoc, values);
            toast({
                title: "Item Updated",
                description: "Your item has been successfully updated.",
            });
        } else {
            // Add new item
            const itemsCollection = collection(db, 'users', user.uid, 'items');
            await addDoc(itemsCollection, {
                ...values,
                createdAt: serverTimestamp(),
            });
            toast({
                title: "Item Added",
                description: "Your new item has been added to the inventory.",
            });
        }
        setIsFormOpen(false);
        setEditingItem(null);
    } catch(error) {
        console.error("Error saving item:", error);
        toast({
            variant: "destructive",
            title: "Something went wrong",
            description: `Could not save the item. Please try again.`,
        });
    } finally {
        form.control.disabled = false;
    }
  };

  const totalStockValue = useMemo(() => {
    return items.reduce((total, item) => total + (item.purchasePrice * item.stockQty), 0);
  }, [items]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">Available Items</CardTitle>
              <CardDescription>Manage your inventory and view stock levels.</CardDescription>
            </div>
            <Button onClick={handleAddNewItem}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Item
            </Button>
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
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                          <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
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
                                      <Button variant="ghost" size="icon">
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader>
                                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                              This action cannot be undone. This will permanently delete the item
                                              and remove its data from our servers.
                                          </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteItem(item.id)}>
                                              Delete
                                          </AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                              </AlertDialog>
                          </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No items found. Get started by adding a new item.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update the details of your item.' : 'Fill out the form to add a new item to your inventory.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Vintage Leather Jacket" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="purchasePrice"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Purchase Price</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g., 50.00" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="salePrice"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Sale Price</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g., 120.00" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
              </div>
              <FormField
                control={form.control}
                name="stockQty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 15" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="supplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Local Crafts Co." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={form.control.disabled}>
                  {form.control.disabled && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Item
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
