'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import type { Customer } from '@/lib/types';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function CustomersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'users', user.uid, 'customers'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const customersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching customers: ", error);
      toast({
        variant: 'destructive',
        title: 'Error fetching customers',
        description: 'Could not load customer data. Please try again later.',
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();
  
  const calculateBalance = (customer: Customer) => {
    const balance = (customer.totalCredit || 0) - (customer.totalPaid || 0);
    return balance;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">Customers</CardTitle>
            <CardDescription>View and manage your customer relationships.</CardDescription>
          </div>
           <Button asChild>
            <Link href="/dashboard/customers/new">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Customer
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center">
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => {
                    const balance = calculateBalance(customer);
                    return (
                      <TableRow key={customer.id} className="cursor-pointer">
                        <TableCell>
                          <Link href={`/dashboard/customers/${customer.id}`} className="flex items-center gap-3 w-full">
                            <Avatar>
                              <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{customer.name}</p>
                              {customer.phone && (
                                <p className="text-sm text-muted-foreground">{customer.phone}</p>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                           <Link href={`/dashboard/customers/${customer.id}`} className="w-full h-full flex justify-end items-center">
                            <span className={balance > 0 ? 'text-destructive' : 'text-green-600'}>
                              ${Math.abs(balance).toFixed(2)}
                            </span>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
