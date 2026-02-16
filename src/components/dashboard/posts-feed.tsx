'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, where, limit } from 'firebase/firestore';
import type { Post } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Image as ImageIcon, Send, X } from 'lucide-react';
import Image from 'next/image';
import { PostCard } from './post-card';
import { Skeleton } from '../ui/skeleton';


function CreatePostForm() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
  
  const handleCreatePost = async () => {
    if (!user || (!text.trim() && !photoBase64)) {
        toast({variant: 'destructive', title: 'Post cannot be empty.'});
        return;
    };
    setIsSaving(true);
    try {
        await addDoc(collection(db, 'posts'), {
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            userPhotoUrl: profile?.photoUrl || null,
            text: text.trim(),
            imageUrl: photoBase64,
            createdAt: serverTimestamp(),
            isDeleted: false,
            reactionCounts: {},
            commentCount: 0
        });
        setText('');
        setPhotoBase64(null);
        if(photoInputRef.current) photoInputRef.current.value = '';
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
        <Textarea
          placeholder={`What's on your mind, ${user?.displayName || 'User'}?`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="text-sm"
        />
        {photoBase64 && (
            <div className="relative">
                <Image src={photoBase64} alt="Preview" width={100} height={100} className="rounded-md border" />
                <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setPhotoBase64(null)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )}
        <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" onClick={() => photoInputRef.current?.click()}>
                <ImageIcon className="h-5 w-5" />
            </Button>
            <Button onClick={handleCreatePost} disabled={isSaving} className="h-9 px-4 text-sm">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Post
            </Button>
        </div>
        <input type="file" ref={photoInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
      </CardContent>
    </Card>
  );
}


export function PostsFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const postsQuery = query(
      collection(db, 'posts'), 
      where('isDeleted', '==', false), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching posts:", error);
      toast({variant: 'destructive', title: 'Error', description: 'Could not load the feed.'});
      setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

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
