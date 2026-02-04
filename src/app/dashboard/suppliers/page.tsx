'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import type { Supplier } from '@/lib/types';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuppliersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'users', user.uid, 'suppliers'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const suppliersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(suppliersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching suppliers: ", error);
      toast({
        variant: 'destructive',
        title: 'Error fetching suppliers',
        description: 'Could not load supplier data. Please try again later.',
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();
  
  const calculateBalance = (supplier: Supplier) => {
    const balance = (supplier.totalPurchase || 0) - (supplier.totalPaid || 0);
    return balance;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">Suppliers</CardTitle>
            <CardDescription>Manage your accounts payable and supplier information.</CardDescription>
          </div>
           <Button asChild>
            <Link href="/dashboard/suppliers/new">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Supplier
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
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Payable Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center">
                      No suppliers found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((supplier) => {
                    const balance = calculateBalance(supplier);
                    return (
                      <TableRow key={supplier.id} className="cursor-pointer">
                        <TableCell>
                          <Link href={`/dashboard/suppliers/${supplier.id}`} className="flex items-center gap-3 w-full">
                            <Avatar>
                              <AvatarFallback>{getInitials(supplier.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{supplier.name}</p>
                              {supplier.phone && (
                                <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                           <Link href={`/dashboard/suppliers/${supplier.id}`} className="w-full h-full flex justify-end items-center">
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
