'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { UserPlus, UserCheck, UserX, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface PublicUserProfile {
  uid: string;
  fullName: string;
  shopName?: string;
  photoUrl?: string;
}

interface Friendship {
  id: string;
  users: [string, string];
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  requestedBy: string;
  otherUser?: PublicUserProfile;
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
  const [activeTab, setActiveTab] = useState('find');
  
  const [findFriendsList, setFindFriendsList] = useState<PublicUserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [acceptedFriends, setAcceptedFriends] = useState<Friendship[]>([]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch all public user profiles for discovery
      const usersQuery = query(collection(db, 'publicUsers'));
      const usersSnapshot = await getDocs(usersQuery);
      const allUsersData = usersSnapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as PublicUserProfile))
        .filter(u => u.uid !== user.uid);
      
      setAllUsers(allUsersData);

      // Fetch friendships related to the current user
      const friendshipsQuery = query(collection(db, 'friendships'), where('users', 'array-contains', user.uid));
      const friendshipsSnapshot = await getDocs(friendshipsQuery);
      const friendshipsData = friendshipsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Friendship));
      
      const friendshipMap = new Map(friendshipsData.map(f => [f.id, f]));
      const relatedUserIds = new Set<string>();
      
      const pending: Friendship[] = [];
      const accepted: Friendship[] = [];

      friendshipsData.forEach(f => {
        const otherUserId = f.users.find(uid => uid !== user.uid);
        if (otherUserId) {
          relatedUserIds.add(otherUserId);
          const otherUser = allUsersData.find(u => u.uid === otherUserId);
          const friendshipWithUser = { ...f, otherUser };

          if (f.status === 'pending' && f.requestedBy !== user.uid) {
            pending.push(friendshipWithUser);
          } else if (f.status === 'accepted') {
            accepted.push(friendshipWithUser);
          }
        }
      });
      
      setPendingRequests(pending);
      setAcceptedFriends(accepted);
      setFriendships(friendshipsData);

      const findList = allUsersData.filter(u => !relatedUserIds.has(u.uid));
      setFindFriendsList(findList);

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

  const renderList = (items: any[], type: 'find' | 'pending' | 'friends') => {
    if (loading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      );
    }
    if (items.length === 0) {
      const messages = {
        find: 'No new users to add.',
        pending: 'No pending friend requests.',
        friends: "You haven't added any friends yet."
      }
      return <p className="text-center text-muted-foreground py-8">{messages[type]}</p>;
    }
    return (
      <ul className="space-y-4">
        {items.map((item) => {
          const userProfile = type === 'find' ? item : item.otherUser;
          if (!userProfile) return null;

          return (
            <li key={userProfile.uid} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <Avatar>
                  <AvatarImage src={userProfile.photoUrl ?? undefined} />
                  <AvatarFallback>{getInitials(userProfile.fullName)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{userProfile.fullName}</p>
                  {userProfile.shopName && <p className="text-sm text-muted-foreground">{userProfile.shopName}</p>}
                </div>
              </div>
              {type === 'find' && (
                <Button size="sm" onClick={() => handleSendRequest(userProfile)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Add Friend
                </Button>
              )}
              {type === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleUpdateRequest(item.id, 'rejected')}>
                    <UserX className="mr-2 h-4 w-4" /> Decline
                  </Button>
                  <Button size="sm" onClick={() => handleUpdateRequest(item.id, 'accepted')}>
                    <UserCheck className="mr-2 h-4 w-4" /> Accept
                  </Button>
                </div>
              )}
              {type === 'friends' && (
                 <Button asChild>
                    <Link href={`/dashboard/chat/${userProfile.uid}`}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Chat
                    </Link>
                  </Button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">Friends</CardTitle>
          <CardDescription>Manage your friends, requests, and discover new users.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="find">Find Friends</TabsTrigger>
              <TabsTrigger value="pending">Pending Requests</TabsTrigger>
              <TabsTrigger value="friends">My Friends</TabsTrigger>
            </TabsList>
            <TabsContent value="find" className="mt-4">
              {renderList(findFriendsList, 'find')}
            </TabsContent>
            <TabsContent value="pending" className="mt-4">
              {renderList(pendingRequests, 'pending')}
            </TabsContent>
            <TabsContent value="friends" className="mt-4">
              {renderList(acceptedFriends, 'friends')}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
