'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import type { PublicUserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Camera, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const listingSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters long.'),
  description: z.string().min(10, 'Description must be at least 10 characters long.'),
  price: z.coerce.number().min(0.01, 'Price must be greater than 0.'),
});

type ListingFormValues = z.infer<typeof listingSchema>;

export default function NewMarketplaceListingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: { title: '', description: '', price: undefined },
  });

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1024;
            let { width, height } = img;
            if (width > MAX_WIDTH) {
                height = (height * MAX_WIDTH) / width;
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setPhotoBase64(dataUrl);
        };
        img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  async function onSubmit(values: ListingFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not authenticated' });
      return;
    }
    if (!photoBase64) {
      toast({ variant: 'destructive', title: 'Image required', description: 'Please upload an image for your listing.' });
      return;
    }
    setLoading(true);
    try {
      const publicProfileRef = doc(db, 'publicUsers', user.uid);
      const publicProfileSnap = await getDoc(publicProfileRef);
      const publicProfile = publicProfileSnap.data() as PublicUserProfile | undefined;

      await addDoc(collection(db, 'marketplace'), {
        ...values,
        sellerId: user.uid,
        sellerName: publicProfile?.fullName || user.displayName || 'Anonymous',
        sellerPhotoUrl: publicProfile?.photoUrl || null,
        imageUrl: photoBase64,
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Listing created', description: 'Your item is now live on the marketplace.' });
      router.push('/dashboard/marketplace');
    } catch (error: any) {
      console.error("Error creating listing: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not create listing.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
         <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/marketplace"><ArrowLeft /></Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Create New Listing</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Item Details</CardTitle>
            <CardDescription>Fill in the information for the item you want to sell.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g., Vintage Leather Jacket" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe your item in detail..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem><FormLabel>Price</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g., 99.99" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem>
                  <FormLabel>Photo</FormLabel>
                  {photoBase64 ? (
                    <div className="relative w-fit">
                      <Image src={photoBase64} alt="Preview" width={150} height={150} className="rounded-md border" />
                      <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-7 w-7 rounded-full" onClick={() => setPhotoBase64(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <FormControl>
                      <div className="relative">
                        <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="file" accept="image/*" onChange={handlePhotoChange} className="pl-10" />
                      </div>
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" asChild>
                        <Link href="/dashboard/marketplace">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Listing
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
