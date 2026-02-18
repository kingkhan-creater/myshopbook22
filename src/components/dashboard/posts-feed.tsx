'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, where, limit, getDocs } from 'firebase/firestore';
import type { Post, PostPrivacy } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Image as ImageIcon, Send, X, Globe, Users, Lock, Video } from 'lucide-react';
import Image from 'next/image';
import { PostCard } from './post-card';
import { Skeleton } from '../ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCloudinarySignature } from '@/app/actions/cloudinary';


function CreatePostForm() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<PostPrivacy>('public');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoFile(null);
    setVideoPreview(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhotoBase64(dataUrl);
      };
      img.src = e.target.result as string;
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
  
  const handleCreatePost = async () => {
    if (!user || (!text.trim() && !photoBase64 && !videoFile)) {
        toast({variant: 'destructive', title: 'Post cannot be empty.'});
        return;
    };
    setIsSaving(true);
    try {
        let finalVideoUrl: string | null = null;

        if (videoFile) {
            const { signature, timestamp, cloudName, apiKey, folder } = await getCloudinarySignature('posts');
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

        await addDoc(collection(db, 'posts'), {
            userId: user.uid,
            userName: profile?.fullName || user.displayName || 'Anonymous',
            userPhotoUrl: profile?.photoUrl || null,
            text: text.trim(),
            imageUrl: photoBase64,
            videoUrl: finalVideoUrl,
            privacy: privacy,
            createdAt: serverTimestamp(),
            isDeleted: false,
            reactionCounts: {},
            commentCount: 0
        });
        
        setText('');
        setPhotoBase64(null);
        setVideoFile(null);
        setVideoPreview(null);
        toast({title: 'Post published!'});
    } catch(e: any) {
        console.error("Error creating post: ", e);
        toast({variant: 'destructive', title: 'Error', description: 'Could not create post.'});
    } finally {
        setIsSaving(false);
    }
  }

  return (
    <Card className="mb-4 sm:mb-6">
      <CardContent className="p-3 sm:p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
            <p className="font-bold text-sm">{profile?.fullName || user?.displayName}</p>
            <Select value={privacy} onValueChange={(v: any) => setPrivacy(v)}>
                <SelectTrigger className="h-7 px-2 text-xs bg-muted border-none w-auto gap-1">
                    {privacy === 'public' && <Globe className="h-3 w-3" />}
                    {privacy === 'friends' && <Users className="h-3 w-3" />}
                    {privacy === 'private' && <Lock className="h-3 w-3" />}
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="public"><div className="flex items-center gap-2"><Globe className="h-3 w-3" /> Public</div></SelectItem>
                    <SelectItem value="friends"><div className="flex items-center gap-2"><Users className="h-3 w-3" /> Friends</div></SelectItem>
                    <SelectItem value="private"><div className="flex items-center gap-2"><Lock className="h-3 w-3" /> Only Me</div></SelectItem>
                </SelectContent>
            </Select>
        </div>
        <Textarea
          placeholder={`What's on your mind, ${user?.displayName || 'User'}?`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="text-sm"
        />
        {photoBase64 && (
            <div className="relative">
                <Image src={photoBase64} alt="Preview" width={150} height={150} className="rounded-md border object-cover" />
                <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full" onClick={() => setPhotoBase64(null)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )}
        {videoPreview && (
            <div className="relative aspect-video rounded-md overflow-hidden bg-black/5 max-w-xs">
                <video src={videoPreview} className="w-full h-full object-contain" autoPlay muted loop />
                <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full" onClick={() => { setVideoFile(null); setVideoPreview(null); }}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )}
        <div className="flex justify-between items-center">
            <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => photoInputRef.current?.click()} title="Add Photo">
                    <ImageIcon className="h-5 w-5 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => videoInputRef.current?.click()} title="Add Video">
                    <Video className="h-5 w-5 text-red-500" />
                </Button>
            </div>
            <Button onClick={handleCreatePost} disabled={isSaving} className="h-9 px-4 text-sm font-bold">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Post
            </Button>
        </div>
        <input type="file" ref={photoInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
        <input type="file" ref={videoInputRef} onChange={handleVideoChange} className="hidden" accept="video/*" />
      </CardContent>
    </Card>
  );
}


export function PostsFeed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [friendsIds, setFriendsIds] = useState<string[]>([]);
  const { toast } = useToast();

  // Fetch accepted friends list for privacy filtering
  useEffect(() => {
    if (!user) return;
    const friendsQuery = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', user.uid),
        where('status', '==', 'accepted')
    );
    const unsub = onSnapshot(friendsQuery, (snap) => {
        const ids = snap.docs.map(doc => {
            const data = doc.data();
            return data.users.find((uid: string) => uid !== user.uid);
        });
        setFriendsIds(ids);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    const postsQuery = query(
      collection(db, 'posts'), 
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const postsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Post))
        .filter(p => {
            if (p.isDeleted) return false;
            if (!user) return p.privacy === 'public';
            
            // Privacy Logic
            const isOwner = p.userId === user.uid;
            const isFriend = friendsIds.includes(p.userId);
            const privacy = p.privacy || 'public';

            if (isOwner) return true;
            if (privacy === 'public') return true;
            if (privacy === 'friends' && isFriend) return true;
            
            return false;
        });
      
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching posts:", error);
      toast({variant: 'destructive', title: 'Error', description: 'Could not load the feed.'});
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, friendsIds, toast]);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <CreatePostForm />
       {loading ? (
        <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
       ) : posts.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
            <p className="text-lg font-semibold">The feed is empty.</p>
            <p>Be the first one to create a post!</p>
        </div>
       ) : (
        <div className="space-y-4 sm:space-y-6">
            {posts.map(post => <PostCard key={post.id} post={post} />)}
        </div>
       )}
    </div>
  );
}
