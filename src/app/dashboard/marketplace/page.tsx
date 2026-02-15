'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import type { MarketplaceItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Store } from 'lucide-react';


const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

const MarketplaceItemCard = ({ item, isOwner, onMarkAsSold }: { item: MarketplaceItem, isOwner: boolean, onMarkAsSold: (itemId: string) => void }) => (
  <Card className="flex flex-col">
    <CardContent className="p-0">
      <div className="relative w-full h-48 rounded-t-lg overflow-hidden">
        <Image src={item.imageUrl} alt={item.title} layout="fill" objectFit="cover" />
      </div>
    </CardContent>
    <div className="p-4 flex-grow flex flex-col">
      <h3 className="font-semibold text-lg">{item.title}</h3>
      <p className="text-sm text-muted-foreground flex-grow mt-1">{item.description}</p>
      <p className="text-2xl font-bold text-primary mt-2">${item.price.toFixed(2)}</p>
      <div className="border-t -mx-4 my-4" />
      <div className="flex items-center justify-between text-sm">
        <Link href={`/dashboard/marketplace/user/${item.sellerId}`} className="flex items-center gap-2 hover:underline">
          <Avatar className="h-8 w-8">
            <AvatarImage src={item.sellerPhotoUrl ?? undefined} />
            <AvatarFallback>{getInitials(item.sellerName)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{item.sellerName}</span>
        </Link>
        <p className="text-muted-foreground">{formatDistanceToNow(item.createdAt.toDate(), { addSuffix: true })}</p>
      </div>
    </div>
    {isOwner && (
      <CardFooter className="p-2 border-t">
        <Button variant="secondary" size="sm" className="w-full" onClick={() => onMarkAsSold(item.id)}>
          Mark as Sold
        </Button>
      </CardFooter>
    )}
  </Card>
);

export default function MarketplacePage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'marketplace'),
      where('status', '==', 'ACTIVE'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketplaceItem)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching marketplace items:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load marketplace items.' });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleMarkAsSold = async (itemId: string) => {
    if (!user || profile?.role !== 'OWNER') return;
    const itemRef = doc(db, 'marketplace', itemId);
    try {
      await updateDoc(itemRef, { status: 'SOLD' });
      toast({ title: 'Item marked as sold' });
    } catch (error) {
      console.error("Error marking as sold:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not update item status.' });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
          <p className="text-muted-foreground">Browse items for sale from the community.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/marketplace/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Listing
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-full" />)}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map(item => (
            <MarketplaceItemCard
              key={item.id}
              item={item}
              isOwner={user?.uid === item.sellerId && profile?.role === 'OWNER'}
              onMarkAsSold={handleMarkAsSold}
            />
          ))}
        </div>
      ) : (
        <Card className="col-span-full flex flex-col items-center justify-center h-80 border-dashed">
            <Store className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">The marketplace is empty.</h3>
            <p className="text-muted-foreground mt-2">Be the first to list an item for sale!</p>
        </Card>
      )}
    </div>
  );
}
