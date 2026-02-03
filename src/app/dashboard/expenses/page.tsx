'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Wallet, Calendar, CircleDollarSign, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const mockSummary = [
  { title: 'Total Expenses', value: '$8,450.00', icon: Wallet },
  { title: 'This Month', value: '$1,200.50', icon: Calendar },
  { title: 'Pending Payments', value: '$350.00', icon: CircleDollarSign },
];

const mockExpenses = [
  { id: '1', date: '2024-05-20', title: 'Marketing Campaign', category: 'Marketing', amount: 500.00, note: 'Social media ads' },
  { id: '2', date: '2024-05-18', title: 'Supplier Payment', category: 'Cost of Goods', amount: 1240.00, note: 'Invoice #INV-00123' },
  { id: '3', date: '2024-05-15', title: 'Office Rent', category: 'Overhead', amount: 1500.00, note: 'May Rent' },
  { id: '4', date: '2024-05-12', title: 'Software Subscription', category: 'Software', amount: 99.00, note: 'SaaS tool renewal' },
];

export default function ExpensesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
                <Button disabled>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add New Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add Expense</DialogTitle>
                  <DialogDescription>
                    Enter the details of your new expense here. Click save when you're done.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="title" className="text-right">Title</Label>
                    <Input id="title" placeholder="e.g., Office Supplies" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="amount" className="text-right">Amount</Label>
                    <Input id="amount" type="number" placeholder="e.g., 150.00" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="category" className="text-right">Category</Label>
                    <Input id="category" placeholder="e.g., Overhead" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="date" className="text-right">Date</Label>
                    <Input id="date" type="date" className="col-span-3" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={() => setIsDialogOpen(false)}>Save Expense</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-6">Full functionality for adding and managing expenses will be implemented soon.</p>
            <div className="grid gap-4 md:grid-cols-3">
              {mockSummary.map(item => (
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
                  {mockExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.date}</TableCell>
                      <TableCell className="font-medium">{expense.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{expense.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">${expense.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex justify-start gap-2">
                            <Button variant="ghost" size="icon" disabled>
                                <Pencil className="h-4 w-4" />
                            </Button>
                             <Button variant="ghost" size="icon" disabled>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
