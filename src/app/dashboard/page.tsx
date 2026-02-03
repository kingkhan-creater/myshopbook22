'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import type { Supplier, PurchaseBill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, Users, Truck, Bell, Wallet, Receipt } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

const overviewCards = [
  { title: 'Items', description: 'Manage inventory', icon: Package, href: '/dashboard/items' },
  { title: 'Customers', description: 'View customers', icon: Users, href: '/dashboard/customers' },
  { title: 'Suppliers', description: 'Manage suppliers', icon: Truck, href: '/dashboard/suppliers' },
  { title: 'Reminders', description: 'Track tasks', icon: Bell, href: '/dashboard/reminders' },
  { title: 'Expenses', description: 'Track spending', icon: Wallet, href: '/dashboard/expenses' },
];


interface Activity extends PurchaseBill {
  supplierName?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchActivities = async () => {
      setLoading(true);

      try {
        // 1. Fetch all suppliers to create a name map
        const suppliersRef = collection(db, 'users', user.uid, 'suppliers');
        const suppliersSnapshot = await getDocs(suppliersRef);
        const suppliersMap = new Map<string, string>();
        suppliersSnapshot.forEach(doc => {
          const supplierData = doc.data() as Supplier;
          if (supplierData.name) {
             suppliersMap.set(doc.id, supplierData.name);
          }
        });

        // 2. Listen for recent purchase bills
        // As other features are connected, they can be added here.
        const billsQuery = query(
          collection(db, 'users', user.uid, 'purchaseBills'),
          orderBy('createdAt', 'desc'),
          limit(5)
        );

        const unsubscribe = onSnapshot(billsQuery, (snapshot) => {
          const fetchedActivities = snapshot.docs.map(doc => {
            const bill = doc.data() as PurchaseBill;
            return {
              ...bill,
              id: doc.id,
              supplierName: suppliersMap.get(bill.supplierId) || 'Unknown Supplier',
            };
          });
          setActivities(fetchedActivities);
          setLoading(false);
        }, (error) => {
            console.error("Error fetching activities:", error);
            setLoading(false);
        });
        
        return unsubscribe;

      } catch (error) {
        console.error("Error fetching activities:", error);
        setLoading(false);
      }
    };

    const unsubscribePromise = fetchActivities();

    return () => {
      unsubscribePromise.then(unsubscribe => {
        if (unsubscribe) {
          unsubscribe();
        }
      });
    };
  }, [user]);

  const renderActivityItem = (activity: Activity) => {
    const timeAgo = activity.createdAt ? formatDistanceToNow(activity.createdAt.toDate(), { addSuffix: true }) : '';
    return (
      <div key={activity.id} className="flex items-center gap-4">
        <div className="p-3 bg-muted rounded-full">
            <Receipt className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">
            Created purchase bill for <span className="font-semibold">{activity.supplierName}</span>
          </p>
          <p className="text-xs text-muted-foreground">{timeAgo}</p>
        </div>
        <p className="text-sm font-semibold">${activity.totalAmount.toFixed(2)}</p>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {user?.displayName || 'User'}!
        </h1>
        <p className="text-muted-foreground">
          Here's a quick overview of your shop.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {overviewCards.map((card) => (
             <Link key={card.title} href={card.href} className="col-span-1">
              <Card className="hover:bg-card/90 hover:shadow-md transition-all h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
           <div className="lg:col-span-2 md:col-span-2 col-span-1">
             <Link href="/dashboard/friends">
                <Card className="hover:bg-card/90 hover:shadow-md transition-all h-full flex flex-col justify-center">
                    <CardHeader>
                        <CardTitle>Friends & Chat</CardTitle>
                        <CardDescription>Connect with other sellers</CardDescription>
                    </CardHeader>
                </Card>
             </Link>
           </div>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>A log of recent activities will be shown here.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : activities.length > 0 ? (
                  <div className="space-y-6">
                    {activities.map(renderActivityItem)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 min-h-[200px]">
                      <h3 className="text-lg font-semibold">No Recent Activity</h3>
                      <p className="text-muted-foreground mt-2">Your recent updates will appear here.</p>
                  </div>
                )}
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
