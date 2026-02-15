'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  getDoc,
  increment,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import type { Post, Comment, Reaction, ReactionType } from '@/lib/types';
import { ReactionTypes } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThumbsUp, Heart, MessageCircle, MoreHorizontal, Trash2, Laugh, Sparkles, Frown, Angry as AngryIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


interface PublicUserProfile {
  uid: string;
  fullName: string;
  photoUrl?: string;
}

const reactionIcons: { [key in ReactionType]: React.ReactNode } = {
    LIKE: <ThumbsUp className="h-5 w-5 text-blue-500" />,
    LOVE: <Heart className="h-5 w-5 text-red-500 fill-red-500" />,
    HAHA: <Laugh className="h-5 w-5 text-yellow-500" />,
    WOW: <Sparkles className="h-5 w-5 text-amber-400" />,
    SAD: <Frown className="h-5 w-5 text-yellow-600" />,
    ANGRY: <AngryIcon className="h-5 w-5 text-red-700" />,
};

const reactionColors: { [key in ReactionType]: string } = {
    LIKE: 'text-blue-500',
    LOVE: 'text-red-500',
    HAHA: 'text-yellow-500',
    WOW: 'text-amber-400',
    SAD: 'text-yellow-600',
    ANGRY: 'text-red-700',
}

const CommentItem = ({ comment }: { comment: Comment }) => (
    <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8">
            <AvatarImage src={comment.userPhotoUrl ?? undefined}/>
            <AvatarFallback>{(comment.userName || '').substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 bg-muted rounded-lg px-3 py-2">
            <p className="font-semibold text-sm">{comment.userName}</p>
            <p className="text-sm">{comment.text}</p>
        </div>
    </div>
)

export function PostCard({ post }: { post: Post }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [author, setAuthor] = useState<PublicUserProfile | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [myReaction, setMyReaction] = useState<Reaction | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Fetch author details
  useEffect(() => {
    if(!post.userId) return;
    const authorRef = doc(db, 'publicUsers', post.userId);
    getDoc(authorRef).then(docSnap => {
        if(docSnap.exists()){
            setAuthor({uid: docSnap.id, ...docSnap.data()} as PublicUserProfile);
        }
    })
  }, [post.userId]);
  
  // Real-time listeners for reactions and comments
  useEffect(() => {
    const reactionsRef = collection(db, 'posts', post.id, 'reactions');
    const unsubReactions = onSnapshot(reactionsRef, snapshot => {
        const reactionsData = snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() } as Reaction));
        setReactions(reactionsData);
        setMyReaction(reactionsData.find(r => r.userId === user?.uid) || null);
    });

    const commentsQuery = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'));
    const unsubComments = onSnapshot(commentsQuery, snapshot => {
        const commentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data()} as Comment));
        setComments(commentsData);
    });

    return () => {
        unsubReactions();
        unsubComments();
    }
  }, [post.id, user?.uid]);
  
  const handleReaction = async (newType: ReactionType) => {
    if (!user) return;
    setIsPopoverOpen(false); // Close popover after selection
    
    const reactionRef = doc(db, 'posts', post.id, 'reactions', user.uid);
    const postRef = doc(db, 'posts', post.id);

    try {
        await runTransaction(db, async (transaction) => {
            const reactionSnap = await transaction.get(reactionRef);
            
            const oldReactionType = reactionSnap.exists() ? (reactionSnap.data() as Reaction).type : null;
            const isUnReacting = oldReactionType === newType;

            // Prepare updates, which might be conditional
            const updates: { [key: string]: any } = {};

            // Decrement old reaction count if it exists
            if (oldReactionType) {
                updates[`reactionCounts.${oldReactionType}`] = increment(-1);
            }

            // If not un-reacting, set new reaction and increment new count
            if (!isUnReacting) {
                transaction.set(reactionRef, { userId: user.uid, type: newType, createdAt: serverTimestamp() });
                updates[`reactionCounts.${newType}`] = increment(1);
            } else {
                // If un-reacting, delete the reaction doc
                transaction.delete(reactionRef);
            }
            
            if (Object.keys(updates).length > 0) {
                 transaction.update(postRef, updates);
            }
        });
    } catch (e: any) {
        console.error("Reaction transaction failed: ", e);
        toast({
            variant: "destructive",
            title: "Error",
            description: `Could not apply reaction. ${e.message}`,
        });
    }
  };


  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;
    
    try {
        const commentsRef = collection(db, 'posts', post.id, 'comments');
        await addDoc(commentsRef, {
            userId: user.uid,
            userName: user.displayName,
            userPhotoUrl: profile?.photoUrl || null,
            text: newComment,
            createdAt: serverTimestamp()
        });
        const postRef = doc(db, 'posts', post.id);
        await updateDoc(postRef, { commentCount: increment(1) });
        setNewComment('');
    } catch(e) {
        toast({variant: 'destructive', title: 'Error', description: 'Could not post comment.'})
    }
  };

  const handleDeletePost = async () => {
    if (user?.uid !== post.userId || profile?.role !== 'OWNER') return;
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    
    try {
        const postRef = doc(db, 'posts', post.id);
        await updateDoc(postRef, { isDeleted: true });
        toast({title: 'Post deleted.'});
    } catch(e) {
        toast({variant: 'destructive', title: 'Error', description: 'Could not delete post.'})
    }
  }

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  const { totalReactions, topReactions } = useMemo(() => {
    const counts = post.reactionCounts || {};
    const total = Object.values(counts).reduce((sum, count) => sum + (count || 0), 0);
    const top = Object.entries(counts)
        .filter(([, count]) => (count || 0) > 0)
        .sort(([, a], [, b]) => (b || 0) - (a || 0))
        .slice(0, 3)
        .map(([type]) => type as ReactionType);
    return { totalReactions: total, topReactions: top };
  }, [post.reactionCounts]);


  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Avatar>
            <AvatarImage src={author?.photoUrl ?? undefined} />
            <AvatarFallback>{getInitials(author?.fullName || post.userName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
            <p className="font-semibold">{author?.fullName || post.userName}</p>
            <p className="text-xs text-muted-foreground">
                {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : '...'}
            </p>
        </div>
        {user?.uid === post.userId && profile?.role === 'OWNER' && (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleDeletePost} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete Post</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )}
      </CardHeader>
      <CardContent>
        {post.text && <p className="whitespace-pre-wrap mb-4">{post.text}</p>}
        {post.imageUrl && (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                <Image src={post.imageUrl} alt="Post image" layout="fill" objectFit="contain" className="bg-muted"/>
            </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-4">
        <div className="flex justify-between items-center w-full text-muted-foreground text-sm">
            <div className="flex items-center gap-1">
              {topReactions.map(type => React.cloneElement(reactionIcons[type] as React.ReactElement, { key: type, className: 'h-4 w-4'}))}
              {totalReactions > 0 && <span className="ml-1">{totalReactions}</span>}
            </div>
            <span>{comments.length} Comments</span>
        </div>
        <div className="flex w-full border-t border-b py-1">
             <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" className="flex-1">
                        {myReaction ? (
                             <span className={cn('flex items-center gap-2', reactionColors[myReaction.type])}>
                                {React.cloneElement(reactionIcons[myReaction.type] as React.ReactElement, { className: 'h-4 w-4'})}
                                {myReaction.type}
                            </span>
                        ) : (
                             <span className="flex items-center gap-2">
                                <ThumbsUp className="mr-2 h-4 w-4" /> Like
                             </span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1">
                    <div className="flex gap-1">
                        {ReactionTypes.map(type => (
                            <Button key={type} variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:scale-125 transition-transform" onClick={() => handleReaction(type)}>
                                {reactionIcons[type]}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
            <Button variant="ghost" className="flex-1">
                <MessageCircle className="mr-2 h-4 w-4" /> Comment
            </Button>
        </div>
        <div className="w-full space-y-4">
            {comments.map(comment => <CommentItem key={comment.id} comment={comment}/>)}
        </div>
        <form onSubmit={handleAddComment} className="w-full flex items-center gap-2">
            <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.photoUrl ?? undefined}/>
                <AvatarFallback>{getInitials(user?.displayName || '')}</AvatarFallback>
            </Avatar>
            <Input 
                placeholder="Write a comment..." 
                className="flex-1" 
                value={newComment} 
                onChange={e => setNewComment(e.target.value)}
            />
            <Button type="submit" size="sm">Send</Button>
        </form>
      </CardFooter>
    </Card>
  );
}
