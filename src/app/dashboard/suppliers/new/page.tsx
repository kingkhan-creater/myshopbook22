'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

const supplierSchema = z.object({
  name: z.string().min(2, { message: "Supplier name is required." }),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export default function NewSupplierPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

  async function onSubmit(values: SupplierFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not authenticated' });
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'suppliers'), {
        ...values,
        totalPurchase: 0,
        totalPaid: 0,
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Supplier created', description: `${values.name} has been added to your supplier list.` });
      router.push('/dashboard/suppliers');
    } catch (error: any) {
      console.error("Error creating supplier: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not create supplier.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
         <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/suppliers"><ArrowLeft /></Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Add New Supplier</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Supplier Details</CardTitle>
            <CardDescription>Fill in the information for the new supplier.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter supplier's full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter phone number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" asChild>
                        <Link href="/dashboard/suppliers">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Supplier
                    </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
