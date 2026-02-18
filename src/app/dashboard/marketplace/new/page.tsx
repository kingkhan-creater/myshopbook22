'use client';

import { useState, useRef } from 'react';
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
import { ArrowLeft, Loader2, Camera, X, Video } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getCloudinarySignature } from '@/app/actions/cloudinary';

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
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: { title: '', description: '', price: undefined },
  });

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoFile(null);
    setVideoPreview(null);

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

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoBase64(null);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  async function onSubmit(values: ListingFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not authenticated' });
      return;
    }
    if (!photoBase64 && !videoFile) {
      toast({ variant: 'destructive', title: 'Media required', description: 'Please upload an image or video for your listing.' });
      return;
    }
    setLoading(true);
    try {
      let finalVideoUrl: string | null = null;

      if (videoFile) {
          const { signature, timestamp, cloudName, apiKey, folder } = await getCloudinarySignature('marketplace');
          const formData = new FormData();
          formData.append('file', videoFile);
          formData.append('api_key', apiKey);
          formData.append('timestamp', timestamp.toString());
          formData.append('signature', signature);
          formData.append('folder', folder);

          const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
              method: 'POST',
              body: formData
          });
          
          if (!response.ok) throw new Error('Video upload failed');
          const data = await response.json();
          finalVideoUrl = data.secure_url;
      }

      const publicProfileRef = doc(db, 'publicUsers', user.uid);
      const publicProfileSnap = await getDoc(publicProfileRef);
      const publicProfile = publicProfileSnap.data() as PublicUserProfile | undefined;

      await addDoc(collection(db, 'marketplace'), {
        ...values,
        sellerId: user.uid,
        sellerName: publicProfile?.fullName || user.displayName || 'Anonymous',
        sellerPhotoUrl: publicProfile?.photoUrl || null,
        imageUrl: photoBase64 || null,
        videoUrl: finalVideoUrl || null,
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
                  <FormLabel>Media</FormLabel>
                  <div className="space-y-4">
                    {photoBase64 ? (
                        <div className="relative w-fit">
                        <Image src={photoBase64} alt="Preview" width={200} height={200} className="rounded-md border object-cover" />
                        <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-7 w-7 rounded-full" onClick={() => setPhotoBase64(null)}><X className="h-4 w-4" /></Button>
                        </div>
                    ) : videoPreview ? (
                        <div className="relative w-full max-w-xs aspect-square rounded-md overflow-hidden bg-black/5">
                            <video src={videoPreview} className="w-full h-full object-contain" autoPlay muted loop />
                            <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 rounded-full" onClick={() => { setVideoFile(null); setVideoPreview(null); }}><X className="h-4 w-4" /></Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <Button type="button" variant="outline" className="h-32 flex-col gap-2" onClick={() => photoInputRef.current?.click()}>
                                <Camera className="h-8 w-8 text-muted-foreground" />
                                <span>Add Photo</span>
                            </Button>
                            <Button type="button" variant="outline" className="h-32 flex-col gap-2" onClick={() => videoInputRef.current?.click()}>
                                <Video className="h-8 w-8 text-muted-foreground" />
                                <span>Add Video</span>
                            </Button>
                        </div>
                    )}
                  </div>
                  <input type="file" ref={photoInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
                  <input type="file" ref={videoInputRef} onChange={handleVideoChange} className="hidden" accept="video/*" />
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
