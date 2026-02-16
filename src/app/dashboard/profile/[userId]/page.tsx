'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  updateDoc,
  getCountFromServer,
} from 'firebase/firestore';
import type { Post, PublicUserProfile } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, Pencil, MessageSquare, UserPlus, Check, Loader2, ArrowLeft } from 'lucide-react';
import { PostCard } from '@/components/dashboard/post-card';
import Image from 'next/image';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';

const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, profile: myProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [targetProfile, setTargetProfile] = useState<PublicUserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ postCount: 0, friendCount: 0 });
  
  // Friendship status state
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending' | 'accepted' | 'requested'>('none');

  // Editing state
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [newBio, setNewBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const coverInputRef = useRef<HTMLInputElement>(null);

  const isMyProfile = user?.uid === userId;

  useEffect(() => {
    if (!userId) return;

    setLoading(true);

    // Fetch Target Profile
    const profileRef = doc(db, 'publicUsers', userId);
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as PublicUserProfile;
        setTargetProfile({ uid: docSnap.id, ...data });
        setNewBio(data.bio || '');
      } else {
        toast({ variant: 'destructive', title: 'User not found' });
        router.push('/dashboard/friends');
      }
    });

    // Fetch User Posts
    const postsQuery = query(
      collection(db, 'posts'),
      where('userId', '==', userId),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc')
    );
    const unsubPosts = onSnapshot(postsQuery, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post)));
      setLoading(false);
    });

    // Fetch Stats (Post Count)
    getCountFromServer(postsQuery).then(snap => {
        setStats(prev => ({ ...prev, postCount: snap.data().count }));
    });

    // Fetch Friend Count & Status
    const friendsQuery = query(collection(db, 'friendships'), where('users', 'array-contains', userId), where('status', '==', 'accepted'));
    getCountFromServer(friendsQuery).then(snap => {
        setStats(prev => ({ ...prev, friendCount: snap.data().count }));
    });

    // Check Friendship Status with Current User
    if (user && !isMyProfile) {
        const friendshipId = [user.uid, userId].sort().join('_');
        const unsubFriendship = onSnapshot(doc(db, 'friendships', friendshipId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.status === 'accepted') setFriendshipStatus('accepted');
                else if (data.status === 'pending') {
                    setFriendshipStatus(data.requestedBy === user.uid ? 'pending' : 'requested');
                }
            } else {
                setFriendshipStatus('none');
            }
        });
        return () => { unsubProfile(); unsubPosts(); unsubFriendship(); };
    }

    return () => {
      unsubProfile();
      unsubPosts();
    };
  }, [userId, user, isMyProfile, router, toast]);

  const handleUpdateBio = async () => {
    if (!user || !isMyProfile) return;
    setIsSaving(true);
    try {
        const publicRef = doc(db, 'publicUsers', user.uid);
        const privateRef = doc(db, 'users', user.uid);
        await updateDoc(publicRef, { bio: newBio.trim() });
        await updateDoc(privateRef, { bio: newBio.trim() });
        setIsEditingBio(false);
        toast({ title: 'Bio updated!' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error updating bio' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleCoverPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !isMyProfile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new (window.Image)();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
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

            try {
                const publicRef = doc(db, 'publicUsers', user.uid);
                const privateRef = doc(db, 'users', user.uid);
                await updateDoc(publicRef, { coverPhotoUrl: dataUrl });
                await updateDoc(privateRef, { coverPhotoUrl: dataUrl });
                toast({ title: 'Cover photo updated!' });
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error uploading cover photo' });
            }
        };
        img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (loading && !targetProfile) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="flex gap-4 items-end -mt-12 px-8">
            <Skeleton className="h-32 w-32 rounded-full border-4 border-background" />
            <div className="pb-4 space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full" />
            <div className="md:col-span-2 space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pb-8">
      {/* --- HEADER SECTION --- */}
      <div className="bg-background shadow-sm rounded-b-xl overflow-hidden">
        {/* Cover Photo */}
        <div className="relative h-48 md:h-80 bg-muted group">
            {targetProfile?.coverPhotoUrl ? (
                <Image src={targetProfile.coverPhotoUrl} alt="Cover" layout="fill" objectFit="cover" />
            ) : (
                <div className="w-full h-full bg-gradient-to-r from-primary/20 to-accent/20 flex items-center justify-center">
                    <p className="text-muted-foreground font-medium">No cover photo</p>
                </div>
            )}
            {isMyProfile && (
                <>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => coverInputRef.current?.click()}
                    >
                        <Camera className="mr-2 h-4 w-4" /> Edit Cover Photo
                    </Button>
                    <input type="file" ref={coverInputRef} onChange={handleCoverPhotoChange} className="hidden" accept="image/*" />
                </>
            )}
            <Button variant="ghost" size="icon" className="absolute top-4 left-4 bg-black/20 text-white hover:bg-black/40 rounded-full" asChild>
                <Link href="/dashboard/friends"><ArrowLeft /></Link>
            </Button>
        </div>

        {/* Profile Identity Area */}
        <div className="max-w-5xl mx-auto px-4 sm:px-8 pb-6">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 -mt-12 md:-mt-16">
                <div className="relative">
                    <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-background shadow-lg">
                        <AvatarImage src={targetProfile?.photoUrl ?? undefined} />
                        <AvatarFallback className="text-4xl">{getInitials(targetProfile?.fullName || '')}</AvatarFallback>
                    </Avatar>
                    {isMyProfile && (
                        <Button variant="secondary" size="icon" className="absolute bottom-2 right-2 rounded-full h-8 w-8 shadow-md">
                            <Camera className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <div className="flex-1 text-center md:text-left pb-2">
                    <h1 className="text-2xl md:text-4xl font-bold">{targetProfile?.fullName}</h1>
                    {targetProfile?.shopName && <p className="text-muted-foreground font-medium">{targetProfile.shopName}</p>}
                    <div className="flex items-center justify-center md:justify-start gap-4 mt-2 text-sm text-muted-foreground font-semibold">
                        <span>{stats.friendCount} {stats.friendCount === 1 ? 'friend' : 'friends'}</span>
                        <span className="h-1 w-1 bg-muted-foreground rounded-full" />
                        <span>{stats.postCount} {stats.postCount === 1 ? 'post' : 'posts'}</span>
                    </div>
                </div>
                <div className="flex gap-2 pb-2">
                    {isMyProfile ? (
                        <Button variant="secondary" className="font-bold">
                            <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                        </Button>
                    ) : (
                        <>
                            {friendshipStatus === 'accepted' ? (
                                <>
                                    <Button variant="secondary" className="font-bold">
                                        <Check className="mr-2 h-4 w-4" /> Friends
                                    </Button>
                                    <Button asChild>
                                        <Link href={`/dashboard/chat/${userId}`}>
                                            <MessageSquare className="mr-2 h-4 w-4" /> Message
                                        </Link>
                                    </Button>
                                </>
                            ) : friendshipStatus === 'pending' ? (
                                <Button variant="secondary" disabled className="font-bold">
                                    Request Sent
                                </Button>
                            ) : friendshipStatus === 'requested' ? (
                                <Button className="font-bold">
                                    Respond to Request
                                </Button>
                            ) : (
                                <Button className="font-bold">
                                    <UserPlus className="mr-2 h-4 w-4" /> Add Friend
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
            
            <Separator className="my-6" />

            {/* Bio Section */}
            <div className="flex flex-col items-center md:items-start max-w-2xl">
                {isEditingBio ? (
                    <div className="w-full space-y-2">
                        <Textarea 
                            placeholder="Describe who you are..." 
                            value={newBio} 
                            onChange={(e) => setNewBio(e.target.value)}
                            className="text-center md:text-left"
                        />
                        <div className="flex gap-2 justify-center md:justify-start">
                            <Button variant="ghost" size="sm" onClick={() => setIsEditingBio(false)}>Cancel</Button>
                            <Button size="sm" onClick={handleUpdateBio} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className={cn(
                            "text-sm md:text-base text-center md:text-left",
                            !targetProfile?.bio && "text-muted-foreground italic"
                        )}>
                            {targetProfile?.bio || (isMyProfile ? "Add a bio to tell people about yourself." : "No bio yet.")}
                        </p>
                        {isMyProfile && (
                            <Button variant="link" size="sm" className="px-0 h-auto font-bold mt-1" onClick={() => setIsEditingBio(true)}>
                                {targetProfile?.bio ? 'Edit Bio' : 'Add Bio'}
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
      </div>

      {/* --- CONTENT SECTION --- */}
      <div className="max-w-5xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* Sidebar Stats / Info */}
            <div className="md:col-span-2 space-y-6">
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-lg font-bold">Intro</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3 text-sm">
                            <Check className="h-5 w-5 text-muted-foreground" />
                            <span>Member since {targetProfile?.createdAt ? targetProfile.createdAt.toDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '...'}</span>
                        </div>
                        {targetProfile?.shopName && (
                            <div className="flex items-center gap-3 text-sm">
                                <Check className="h-5 w-5 text-muted-foreground" />
                                <span>Owner at <span className="font-bold">{targetProfile.shopName}</span></span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Posts Timeline */}
            <div className="md:col-span-3 space-y-6">
                {posts.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-12 bg-background border-dashed shadow-none">
                        <p className="text-muted-foreground font-medium">No posts to show.</p>
                    </Card>
                ) : (
                    posts.map(post => <PostCard key={post.id} post={post} />)
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
