'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Camera } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const customerSchema = z.object({
  name: z.string().min(2, { message: "Customer name is required." }),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function NewCustomerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

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

  async function onSubmit(values: CustomerFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not authenticated' });
      return;
    }
    setLoading(true);
    try {
      const dataToSave: any = {
        ...values,
        totalCredit: 0,
        totalPaid: 0,
        createdAt: Timestamp.now(),
      };
      if (photoBase64) {
        dataToSave.photoBase64 = photoBase64;
      }
      await addDoc(collection(db, 'users', user.uid, 'customers'), dataToSave);
      toast({ title: 'Customer created', description: `${values.name} has been added to your customer list.` });
      router.push('/dashboard/customers');
    } catch (error: any) {
      console.error("Error creating customer: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not create customer.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
         <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/customers"><ArrowLeft /></Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Add New Customer</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Customer Details</CardTitle>
            <CardDescription>Fill in the information for the new customer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter customer's full name" {...field} />
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
                 <FormItem>
                    <FormLabel>Photo (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="file" accept="image/*" onChange={handlePhotoChange} className="pl-10" />
                      </div>
                    </FormControl>
                    {photoBase64 && <Image src={photoBase64} alt="Preview" width={80} height={80} className="mt-2 rounded-md"/>}
                </FormItem>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" asChild>
                        <Link href="/dashboard/customers">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Customer
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
