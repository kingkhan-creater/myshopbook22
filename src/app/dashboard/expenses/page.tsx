'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { format, isThisMonth, isToday } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Wallet, Calendar as CalendarIcon, Pencil, Trash2, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Expense } from '@/lib/types';


const expenseSchema = z.object({
  title: z.string().min(1, 'Title is required.'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0.'),
  category: z.string().min(1, 'Category is required.'),
  date: z.date({ required_error: 'A date is required.'}),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export default function ExpensesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
  });

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'users', user.uid, 'expenses'), orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const expensesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(expensesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching expenses: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load expenses.' });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, toast]);
  
  const { totalThisMonth, totalToday, totalAllTime } = useMemo(() => {
    let totalThisMonth = 0;
    let totalToday = 0;
    let totalAllTime = 0;

    for (const expense of expenses) {
        const expenseDate = expense.date.toDate();
        totalAllTime += expense.amount;
        if (isThisMonth(expenseDate)) {
            totalThisMonth += expense.amount;
        }
        if (isToday(expenseDate)) {
            totalToday += expense.amount;
        }
    }
    return { totalThisMonth, totalToday, totalAllTime };
  }, [expenses]);

  const openAddDialog = () => {
    setEditingExpense(null);
    form.reset({
        title: '',
        amount: undefined,
        category: '',
        date: new Date()
    });
    setIsDialogOpen(true);
  }
  
  const openEditDialog = (expense: Expense) => {
    setEditingExpense(expense);
    form.reset({
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      date: expense.date.toDate(),
    });
    setIsDialogOpen(true);
  }
  
  const onSubmit = async (values: ExpenseFormValues) => {
    if (!user) return;
    
    const dataToSave = {
        ...values,
        date: Timestamp.fromDate(values.date),
    };

    try {
        if (editingExpense) {
            const expenseDoc = doc(db, 'users', user.uid, 'expenses', editingExpense.id);
            await updateDoc(expenseDoc, dataToSave);
            toast({ title: "Expense Updated" });
        } else {
            await addDoc(collection(db, 'users', user.uid, 'expenses'), {
                ...dataToSave,
                createdAt: serverTimestamp(),
            });
            toast({ title: "Expense Added" });
        }
        setIsDialogOpen(false);
        setEditingExpense(null);
    } catch (error: any) {
        console.error("Error saving expense: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not save expense.' });
    }
  };

  const handleDelete = async (expenseId: string) => {
    if (!user || !window.confirm("Are you sure you want to delete this expense?")) return;
    try {
        await deleteDoc(doc(db, 'users', user.uid, 'expenses', expenseId));
        toast({ title: "Expense Deleted" });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not delete expense.' });
    }
  }
  
  const summaryCards = [
    { title: 'Total Expenses (This Month)', value: `$${totalThisMonth.toFixed(2)}`, icon: CalendarIcon },
    { title: 'Total Expenses (Today)', value: `$${totalToday.toFixed(2)}`, icon: TrendingUp },
    { title: 'Total Expenses (All Time)', value: `$${totalAllTime.toFixed(2)}`, icon: Wallet },
  ];

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">Expenses</CardTitle>
              <CardDescription>Track and manage all your business expenses.</CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add New Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g., Office Supplies" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="amount" render={({ field }) => ( <FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" placeholder="e.g., 150.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="category" render={({ field }) => ( <FormItem><FormLabel>Category</FormLabel><FormControl><Input placeholder="e.g., Overhead" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="date" render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Expense
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {summaryCards.map(item => (
                <Card key={item.title}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{item.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Recent Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {expenses.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center">No expenses found.</TableCell></TableRow>
                    ) : (
                        expenses.map((expense) => (
                            <TableRow key={expense.id}>
                            <TableCell>{format(expense.date.toDate(), 'PP')}</TableCell>
                            <TableCell className="font-medium">{expense.title}</TableCell>
                            <TableCell><Badge variant="outline">{expense.category}</Badge></TableCell>
                            <TableCell className="text-right">${expense.amount.toFixed(2)}</TableCell>
                            <TableCell>
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(expense)}><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                            </TableCell>
                            </TableRow>
                        ))
                    )}
                    </TableBody>
                </Table>
              )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
