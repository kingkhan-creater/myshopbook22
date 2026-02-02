
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, UserCheck, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PublicUserProfile {
  uid: string;
  fullName: string;
  shopName?: string;
  photoURL?: string; // This comes from local storage, not firestore
}

interface Friendship {
  id: string;
  users: [string, string];
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  requestedBy: string;
}

const createFriendshipId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};

export default function FriendsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<PublicUserProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch all public user profiles for discovery
      const usersQuery = query(collection(db, 'publicUsers'));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as PublicUserProfile));
      setAllUsers(usersData);

      // Fetch friendships related to the current user
      const friendshipsQuery = query(collection(db, 'friendships'), where('users', 'array-contains', user.uid));
      const friendshipsSnapshot = await getDocs(friendshipsQuery);
      const friendshipsData = friendshipsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Friendship));
      setFriendships(friendshipsData);

    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: `Could not fetch data. ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { findFriendsList, pendingRequests, acceptedFriends } = useMemo(() => {
    if (!user || allUsers.length === 0) {
      return { findFriendsList: [], pendingRequests: [], acceptedFriends: [] };
    }

    const currentUserUid = user.uid;
    const relatedUserIds = new Set<string>();
    friendships.forEach(f => {
      relatedUserIds.add(f.users[0]);
      relatedUserIds.add(f.users[1]);
    });

    const findFriendsList = allUsers.filter(u => u.uid !== currentUserUid && !relatedUserIds.has(u.uid));

    const enrichedFriendships = friendships.map(f => {
      const otherUserId = f.users.find(uid => uid !== currentUserUid);
      const otherUser = allUsers.find(u => u.uid === otherUserId);
      return { ...f, otherUser };
    });

    const pendingRequests = enrichedFriendships.filter(f => f.status === 'pending' && f.requestedBy !== currentUserUid);
    const acceptedFriends = enrichedFriendships.filter(f => f.status === 'accepted');

    return { findFriendsList, pendingRequests, acceptedFriends };
  }, [user, allUsers, friendships]);
  
  const handleSendRequest = async (targetUser: PublicUserProfile) => {
    if (!user) return;
    const friendshipId = createFriendshipId(user.uid, targetUser.uid);
    const friendshipRef = doc(db, 'friendships', friendshipId);

    try {
      await setDoc(friendshipRef, {
        users: [user.uid, targetUser.uid],
        status: 'pending',
        requestedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Success', description: `Friend request sent to ${targetUser.fullName}.` });
      fetchData(); // Refetch data after sending request
    } catch (error) {
      console.error("Error sending friend request:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not send friend request.' });
    }
  };

  const handleUpdateRequest = async (friendshipId: string, status: 'accepted' | 'rejected') => {
    const friendshipRef = doc(db, 'friendships', friendshipId);
    try {
      await updateDoc(friendshipRef, { status });
      toast({ title: 'Success', description: `Request has been ${status}.` });
      fetchData(); // Refetch data after updating request
    } catch (error) {
      console.error("Error updating friend request:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not update friend request.' });
    }
  };
  
  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">Friends</CardTitle>
          <CardDescription>Manage your friends and friend requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="find" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="find">Find Friends</TabsTrigger>
              <TabsTrigger value="pending">Pending Requests</TabsTrigger>
              <TabsTrigger value="friends">My Friends</TabsTrigger>
            </TabsList>

            <TabsContent value="find" className="mt-4">
              {loading ? (
                 <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                 </div>
              ) : findFriendsList.length > 0 ? (
                <ul className="space-y-4">
                  {findFriendsList.map(u => (
                    <li key={u.uid} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={u.photoURL} />
                          <AvatarFallback>{getInitials(u.fullName)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{u.fullName}</p>
                          {u.shopName && <p className="text-sm text-muted-foreground">{u.shopName}</p>}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleSendRequest(u)}>
                        <UserPlus className="mr-2 h-4 w-4" /> Add Friend
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted-foreground py-8">No new users to add.</p>
              )}
            </TabsContent>

            <TabsContent value="pending" className="mt-4">
                {loading ? (
                    <Skeleton className="h-16 w-full" />
                ) : pendingRequests.length > 0 ? (
                <ul className="space-y-4">
                  {pendingRequests.map(req => req.otherUser && (
                    <li key={req.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={req.otherUser.photoURL} />
                          <AvatarFallback>{getInitials(req.otherUser.fullName)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{req.otherUser.fullName}</p>
                          {req.otherUser.shopName && <p className="text-sm text-muted-foreground">{req.otherUser.shopName}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleUpdateRequest(req.id, 'rejected')}>
                          <UserX className="mr-2 h-4 w-4" /> Decline
                        </Button>
                        <Button size="sm" onClick={() => handleUpdateRequest(req.id, 'accepted')}>
                          <UserCheck className="mr-2 h-4 w-4" /> Accept
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted-foreground py-8">No pending friend requests.</p>
              )}
            </TabsContent>

            <TabsContent value="friends" className="mt-4">
            {loading ? (
                 <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                 </div>
              ) : acceptedFriends.length > 0 ? (
                <ul className="space-y-4">
                  {acceptedFriends.map(friend => friend.otherUser && (
                    <li key={friend.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={friend.otherUser.photoURL} />
                          <AvatarFallback>{getInitials(friend.otherUser.fullName)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{friend.otherUser.fullName}</p>
                           {friend.otherUser.shopName && <p className="text-sm text-muted-foreground">{friend.otherUser.shopName}</p>}
                        </div>
                      </div>
                      <Button variant="secondary" disabled>
                        <UserCheck className="mr-2 h-4 w-4" /> Friends
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted-foreground py-8">You haven't added any friends yet.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
