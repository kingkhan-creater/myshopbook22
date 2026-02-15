'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { MarketplaceItem, PublicUserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Store } from 'lucide-react';

const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

const SellerItemCard = ({ item, isOwner, onMarkAsSold }: { item: MarketplaceItem, isOwner: boolean, onMarkAsSold: (itemId: string) => void }) => (
  <Card className="flex flex-col">
    <CardContent className="p-0">
      <div className="relative w-full h-48 rounded-t-lg overflow-hidden">
        <Image src={item.imageUrl} alt={item.title} layout="fill" objectFit="cover" />
        <Badge className="absolute top-2 right-2" variant={item.status === 'SOLD' ? 'destructive' : 'secondary'}>{item.status}</Badge>
      </div>
    </CardContent>
    <div className="p-4 flex-grow flex flex-col">
      <h3 className="font-semibold text-lg">{item.title}</h3>
      <p className="text-2xl font-bold text-primary mt-2">${item.price.toFixed(2)}</p>
    </div>
    {isOwner && item.status === 'ACTIVE' && (
      <CardFooter className="p-2 border-t">
        <Button variant="secondary" size="sm" className="w-full" onClick={() => onMarkAsSold(item.id)}>
          Mark as Sold
        </Button>
      </CardFooter>
    )}
  </Card>
);

export default function SellerMarketplacePage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const { toast } = useToast();
  
  const sellerId = params.userId;

  const [seller, setSeller] = useState<PublicUserProfile | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) {
      router.push('/dashboard/marketplace');
      return;
    }

    setLoading(true);
    
    // Fetch seller profile
    const userDocRef = doc(db, 'publicUsers', sellerId);
    getDoc(userDocRef).then(docSnap => {
      if (docSnap.exists()) {
        setSeller({ uid: docSnap.id, ...docSnap.data() } as PublicUserProfile);
      } else {
        toast({ variant: 'destructive', title: 'Seller not found' });
      }
    });

    // Listen for seller's items
    const q = query(
      collection(db, 'marketplace'),
      where('sellerId', '==', sellerId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketplaceItem)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching seller items:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load seller items.' });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sellerId, router, toast]);

  const handleMarkAsSold = async (itemId: string) => {
    if (!user || user.uid !== sellerId || profile?.role !== 'OWNER') return;
    const itemRef = doc(db, 'marketplace', itemId);
    try {
      await updateDoc(itemRef, { status: 'SOLD' });
      toast({ title: 'Item marked as sold' });
    } catch (error) {
      console.error("Error marking as sold:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not update item status.' });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80 w-full" />)}
        </div>
      </div>
    );
  }
  
  if (!seller) {
      return (
          <div className="container mx-auto p-8 text-center">
              <p>Seller not found.</p>
              <Button asChild variant="link"><Link href="/dashboard/marketplace">Back to Marketplace</Link></Button>
          </div>
      )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/marketplace"><ArrowLeft /></Link>
        </Button>
        <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
                <AvatarImage src={seller.photoUrl ?? undefined} />
                <AvatarFallback className="text-2xl">{getInitials(seller.fullName)}</AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{seller.fullName}'s Store</h1>
                {seller.shopName && <p className="text-muted-foreground">{seller.shopName}</p>}
            </div>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map(item => (
            <SellerItemCard
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
            <h3 className="text-xl font-semibold">{seller.fullName} hasn't listed any items yet.</h3>
        </Card>
      )}
    </div>
  );
}
