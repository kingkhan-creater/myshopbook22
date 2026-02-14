'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'firebase/firestore';
import type { Post, Comment } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

interface PublicUserProfile {
  uid: string;
  fullName: string;
  photoUrl?: string;
}

const CommentItem = ({ comment }: { comment: Comment }) => (
    <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8">
            <AvatarImage src={comment.userPhotoUrl}/>
            <AvatarFallback>{comment.userName.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 bg-muted rounded-lg px-3 py-2">
            <p className="font-semibold text-sm">{comment.userName}</p>
            <p className="text-sm">{comment.text}</p>
        </div>
    </div>
)

export function PostCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [author, setAuthor] = useState<PublicUserProfile | null>(null);
  const [likes, setLikes] = useState<{ userId: string }[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);

  // Fetch author details
  useEffect(() => {
    const authorRef = doc(db, 'publicUsers', post.userId);
    getDoc(authorRef).then(docSnap => {
        if(docSnap.exists()){
            setAuthor({uid: docSnap.id, ...docSnap.data()} as PublicUserProfile);
        }
    })
  }, [post.userId]);
  
  // Real-time listeners for likes and comments
  useEffect(() => {
    const likesRef = collection(db, 'posts', post.id, 'likes');
    const unsubLikes = onSnapshot(likesRef, snapshot => {
        const likesData = snapshot.docs.map(doc => ({ userId: doc.id }));
        setLikes(likesData);
        setIsLiked(likesData.some(like => like.userId === user?.uid));
    });

    const commentsQuery = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'));
    const unsubComments = onSnapshot(commentsQuery, snapshot => {
        const commentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data()} as Comment));
        setComments(commentsData);
    });

    return () => {
        unsubLikes();
        unsubComments();
    }
  }, [post.id, user?.uid]);


  const handleLike = async () => {
    if (!user) return;
    const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);
    const postRef = doc(db, 'posts', post.id);
    
    if (isLiked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likeCount: increment(-1) });
    } else {
        await setDoc(likeRef, {});
        await updateDoc(postRef, { likeCount: increment(1) });
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
            userPhotoUrl: author?.photoUrl || null,
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
    if (user?.uid !== post.userId) return;
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
        {user?.uid === post.userId && (
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
        <div className="flex justify-between w-full text-muted-foreground text-sm">
            <span>{likes.length} Likes</span>
            <span>{comments.length} Comments</span>
        </div>
        <div className="flex w-full border-t border-b py-1">
            <Button variant="ghost" className="flex-1" onClick={handleLike}>
                <Heart className={cn("mr-2 h-4 w-4", isLiked && "fill-red-500 text-red-500")} /> Like
            </Button>
            <Button variant="ghost" className="flex-1">
                <MessageCircle className="mr-2 h-4 w-4" /> Comment
            </Button>
        </div>
        <div className="w-full space-y-4">
            {comments.map(comment => <CommentItem key={comment.id} comment={comment}/>)}
        </div>
        <form onSubmit={handleAddComment} className="w-full flex items-center gap-2">
            <Avatar className="h-8 w-8">
                <AvatarImage src={user?.photoURL ?? undefined}/>
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
