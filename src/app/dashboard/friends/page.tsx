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
import { PostsFeed } from '@/components/dashboard/posts-feed';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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
  const [activeTab, setActiveTab] = useState('feed');
  
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
      <ul className="space-y-3 sm:space-y-4">
        {items.map((item) => {
          const userProfile = type === 'find' ? item : item.otherUser;
          if (!userProfile) return null;

          return (
            <li key={userProfile.uid} className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:p-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <Avatar className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
                  <AvatarImage src={userProfile.photoUrl ?? undefined} />
                  <AvatarFallback>{getInitials(userProfile.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm sm:text-base truncate">{userProfile.fullName}</p>
                  {userProfile.shopName && <p className="text-xs sm:text-sm text-muted-foreground truncate">{userProfile.shopName}</p>}
                </div>
              </div>
              <div className="flex-shrink-0">
                {type === 'find' && (
                  <Button size="sm" onClick={() => handleSendRequest(userProfile)} className="h-8 text-xs sm:h-9 sm:text-sm">
                    <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Add Friend
                  </Button>
                )}
                {type === 'pending' && (
                  <div className="flex gap-1 sm:gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleUpdateRequest(item.id, 'rejected')} className="h-8 px-2 sm:h-9 sm:px-3">
                      <UserX className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                    <Button size="sm" onClick={() => handleUpdateRequest(item.id, 'accepted')} className="h-8 px-2 sm:h-9 sm:px-3">
                      <UserCheck className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                )}
                {type === 'friends' && (
                   <Button asChild size="sm" className="h-8 text-xs sm:h-9 sm:text-sm">
                      <Link href={`/dashboard/chat/${userProfile.uid}`}>
                        <MessageSquare className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Chat
                      </Link>
                    </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="container mx-auto p-2 sm:p-6 lg:p-8">
      <Card className="border-none sm:border shadow-none sm:shadow-sm">
        <CardHeader className="px-4 py-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Community</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Connect with friends and see what's new in the feed.</CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="relative mb-4">
              <ScrollArea className="w-full">
                <TabsList className="inline-flex w-max sm:grid sm:w-full sm:grid-cols-4 p-1">
                  <TabsTrigger value="feed" className="min-w-[80px] sm:min-w-0">Feed</TabsTrigger>
                  <TabsTrigger value="find" className="min-w-[100px] sm:min-w-0">Find Friends</TabsTrigger>
                  <TabsTrigger value="pending" className="min-w-[100px] sm:min-w-0">Pending</TabsTrigger>
                  <TabsTrigger value="friends" className="min-w-[100px] sm:min-w-0">My Friends</TabsTrigger>
                </TabsList>
                <ScrollBar orientation="horizontal" className="invisible" />
              </ScrollArea>
            </div>
            <TabsContent value="feed" className="mt-0">
                <PostsFeed />
            </TabsContent>
            <TabsContent value="find" className="mt-0">
              {renderList(findFriendsList, 'find')}
            </TabsContent>
            <TabsContent value="pending" className="mt-0">
              {renderList(pendingRequests, 'pending')}
            </TabsContent>
            <TabsContent value="friends" className="mt-0">
              {renderList(acceptedFriends, 'friends')}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
