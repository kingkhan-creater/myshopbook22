'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface UserProfile {
  fullName: string;
  email: string;
  shopName?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrCreateUserProfile() {
      if (user) {
        setLoading(true);
        const docRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            // The user document doesn't exist, let's create it.
            const newProfileData = {
              uid: user.uid,
              fullName: user.displayName || 'User',
              email: user.email,
              shopName: 'ShopBookPro',
              createdAt: serverTimestamp(),
            };

            await setDoc(docRef, newProfileData);
            
            // Set the profile in state for immediate UI update
            setUserProfile({
                fullName: newProfileData.fullName,
                email: newProfileData.email!,
                shopName: newProfileData.shopName,
            });
          }
        } catch (error) {
          console.error("Error fetching or creating user profile:", error);
        } finally {
          setLoading(false);
        }
      }
    }

    fetchOrCreateUserProfile();
  }, [user]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold tracking-tight">Dashboard</CardTitle>
            <CardDescription>
              A personalized welcome to your ShopBookPro experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ) : userProfile ? (
              <div>
                <h2 className="text-2xl font-semibold text-primary">
                  Welcome, {userProfile.fullName}!
                </h2>
                <p className="text-muted-foreground">We're glad to have you here.</p>
              </div>
            ) : (
              <p className="text-destructive">Could not load user profile. Please try again later.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
