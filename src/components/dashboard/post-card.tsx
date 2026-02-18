'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  getDocs,
  increment,
  where,
  setDoc,
} from 'firebase/firestore';
import type { Post, Comment, Reaction, ReactionType, PublicUserProfile, CommentLike } from '@/lib/types';
import { ReactionTypes } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThumbsUp, Heart, MessageCircle, MoreHorizontal, Trash2, Laugh, Sparkles, Frown, Angry as AngryIcon, Send, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';


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

const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();


function CommentItem({
  comment,
  postId,
  postOwnerId,
  profile,
  onDelete,
  onUpdate,
}: {
  comment: Comment;
  postId: string;
  postOwnerId: string;
  profile: PublicUserProfile | undefined;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, newText: string) => void;
}) {
  const { user, profile: myProfile } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [likes, setLikes] = useState<CommentLike[]>([]);
  const [likerProfiles, setLikerProfiles] = useState<Map<string, PublicUserProfile>>(new Map());
  const [myCommentLike, setMyCommentLike] = useState<CommentLike | null>(null);
  const [isLikersOpen, setIsLikersOpen] = useState(false);
  
  // Optimistic state for the icon color
  const [optimisticLike, setOptimisticLike] = useState<boolean>(false);

  useEffect(() => {
    const likesRef = collection(db, 'posts', postId, 'comments', comment.id, 'likes');
    const unsub = onSnapshot(likesRef, (snap) => {
        const data = snap.docs.map(doc => ({ userId: doc.id, ...doc.data() } as CommentLike));
        setLikes(data);
        const mine = data.find(l => l.userId === user?.uid) || null;
        setMyCommentLike(mine);
        setOptimisticLike(!!mine);
    });
    return unsub;
  }, [postId, comment.id, user?.uid]);

  // Fetch liker profiles
  useEffect(() => {
    if (!isLikersOpen || likes.length === 0) return;

    const likerIds = [...new Set(likes.map(l => l.userId))];
    const profilesToFetch = likerIds.filter(id => !likerProfiles.has(id));

    if (profilesToFetch.length === 0) return;

    const fetchProfiles = async (ids: string[]) => {
      try {
        const q = query(collection(db, 'publicUsers'), where('__name__', 'in', ids));
        const snapshot = await getDocs(q);
        const newProfiles = new Map(likerProfiles);
        snapshot.forEach(doc => {
          newProfiles.set(doc.id, { uid: doc.id, ...doc.data() } as PublicUserProfile);
        });
        setLikerProfiles(newProfiles);
      } catch (error) {
        console.error("Error fetching liker profiles:", error);
      }
    };
    
    fetchProfiles(profilesToFetch);
  }, [likes, isLikersOpen, likerProfiles]);

  const handleUpdate = () => {
    if (editText.trim() && editText.trim() !== comment.text) {
      onUpdate(comment.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleLikeComment = useCallback(() => {
    if (!user) return;
    const isLiking = !optimisticLike;
    setOptimisticLike(isLiking);

    const commentRef = doc(db, 'posts', postId, 'comments', comment.id);
    const likeRef = doc(db, 'posts', postId, 'comments', comment.id, 'likes', user.uid);

    if (isLiking) {
        setDoc(likeRef, {
            userId: user.uid,
            userName: myProfile?.fullName || user.displayName || 'Anonymous',
            userPhotoUrl: myProfile?.photoUrl || null,
            createdAt: serverTimestamp()
        });
        updateDoc(commentRef, { likeCount: increment(1) });
    } else {
        deleteDoc(likeRef);
        updateDoc(commentRef, { likeCount: increment(-1) });
    }
  }, [user, optimisticLike, postId, comment.id, myProfile]);

  const canDelete = user?.uid === comment.userId || user?.uid === postOwnerId;
  const canEdit = user?.uid === comment.userId;

  // comment.likeCount is already optimistically updated by Firestore SDK because we are listening to it
  const currentLikeCount = comment.likeCount || 0;

  return (
    <div className="flex items-start gap-2 group">
      <Link href={`/dashboard/profile/${comment.userId}`} className="flex-shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile?.photoUrl ?? undefined} />
          <AvatarFallback>{getInitials(comment.userName)}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="text-sm" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleUpdate}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="inline-block bg-muted rounded-2xl px-3 py-2 relative max-w-full overflow-hidden shadow-sm">
            <Link href={`/dashboard/profile/${comment.userId}`} className="hover:underline">
              <p className="font-bold text-xs truncate">{comment.userName}</p>
            </Link>
            <p className="text-sm break-words">{comment.text}</p>
            {comment.isEdited && <span className="text-[10px] text-muted-foreground block mt-0.5">Edited</span>}
            
            {currentLikeCount > 0 && (
                <div 
                    onClick={() => setIsLikersOpen(true)}
                    className="absolute bottom-1 -right-2 bg-background rounded-full px-1.5 py-0.5 flex items-center gap-1 shadow-md border cursor-pointer hover:bg-accent"
                >
                    <Heart className="h-3 w-3 text-red-500 fill-red-500" />
                    <span className="text-[10px] font-bold">{currentLikeCount}</span>
                </div>
            )}
          </div>
        )}
        {!isEditing && (
            <div className="flex gap-3 px-2 mt-1">
                <button 
                    onClick={handleLikeComment}
                    className={cn(
                        "text-[10px] font-bold hover:underline transition-colors",
                        optimisticLike ? "text-red-500" : "text-muted-foreground"
                    )}
                >
                    Like
                </button>
                <button className="text-[10px] font-bold text-muted-foreground hover:underline">Reply</button>
                <span className="text-[10px] text-muted-foreground">
                    {comment.createdAt ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: false }) : '...'}
                </span>
            </div>
        )}
      </div>
      {(canEdit || canDelete) && !isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDelete(comment.id)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Comment Likers Modal */}
      <Dialog open={isLikersOpen} onOpenChange={setIsLikersOpen}>
        <DialogContent className="max-w-md p-0 h-[50vh] flex flex-col focus:outline-none">
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-center text-sm font-bold">People who liked this comment</DialogTitle>
                <div className="absolute right-4 top-4">
                    <DialogClose asChild><button className="rounded-full h-8 w-8 flex items-center justify-center bg-muted hover:bg-muted/80"><X className="h-4 w-4"/></button></DialogClose>
                </div>
            </DialogHeader>
            <ScrollArea className="flex-1">
                <div className="p-2">
                    {likes.map(like => {
                        const likerProfile = likerProfiles.get(like.userId);
                        return (
                            <Link key={like.userId} href={`/dashboard/profile/${like.userId}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                                <Avatar className="h-10 w-10">
                                    <AvatarImage src={likerProfile?.photoUrl || like.userPhotoUrl || undefined} />
                                    <AvatarFallback>{getInitials(likerProfile?.fullName || like.userName || '')}</AvatarFallback>
                                </Avatar>
                                <span className="font-bold text-sm truncate">{likerProfile?.fullName || like.userName || 'Anonymous'}</span>
                            </Link>
                        );
                    })}
                </div>
            </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}


export function PostCard({ post }: { post: Post }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [author, setAuthor] = useState<PublicUserProfile | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [myReaction, setMyReaction] = useState<Reaction | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userProfilesCache, setUserProfilesCache] = useState<Map<string, PublicUserProfile>>(new Map());
  const [newComment, setNewComment] = useState('');
  
  // Optimistic UI states for the button feel
  const [optimisticReactionType, setOptimisticReactionType] = useState<ReactionType | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Modal states
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isReactionsListOpen, setIsReactionsListOpen] = useState(false);

  // Refs for long press logic
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  
  // Fetch author details
  useEffect(() => {
    if (!post.userId) return;
    const authorRef = doc(db, 'publicUsers', post.userId);
    const unsubscribe = onSnapshot(authorRef, (docSnap) => {
      if (docSnap.exists()) {
        setAuthor({ uid: docSnap.id, ...docSnap.data() } as PublicUserProfile);
      }
    });
    return unsubscribe;
  }, [post.userId]);
  
  // Real-time listeners for reactions and comments
  useEffect(() => {
    const reactionsRef = collection(db, 'posts', post.id, 'reactions');
    const unsubReactions = onSnapshot(reactionsRef, snapshot => {
      const reactionsData = snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() } as Reaction));
      setReactions(reactionsData);
      
      const foundMyReaction = reactionsData.find(r => r.userId === user?.uid) || null;
      setMyReaction(foundMyReaction);
      
      // Sync optimistic state once real data arrives
      setOptimisticReactionType(foundMyReaction?.type || null);
    });

    const commentsQuery = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'));
    const unsubComments = onSnapshot(commentsQuery, snapshot => {
      const commentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setComments(commentsData);
    });

    return () => {
      unsubReactions();
      unsubComments();
    };
  }, [post.id, user?.uid]);

  // Fetch profiles for commenters AND reactors to avoid "Anonymous"
  useEffect(() => {
    const relevantIds = [...new Set([
        ...comments.map(c => c.userId),
        ...(isReactionsListOpen ? reactions.map(r => r.userId) : [])
    ])].filter(id => id && !userProfilesCache.has(id));

    if (relevantIds.length === 0) return;

    const fetchProfiles = async (ids: string[]) => {
      try {
        const q = query(collection(db, 'publicUsers'), where('__name__', 'in', ids));
        const snapshot = await getDocs(q);
        const newProfiles = new Map(userProfilesCache);
        snapshot.forEach(doc => {
          newProfiles.set(doc.id, { uid: doc.id, ...doc.data() } as PublicUserProfile);
        });
        setUserProfilesCache(newProfiles);
      } catch (error) {
        console.error("Error fetching user profiles:", error);
      }
    };
    
    for (let i = 0; i < relevantIds.length; i += 30) {
        const batchIds = relevantIds.slice(i, i + 30);
        fetchProfiles(batchIds);
    }
  }, [comments, reactions, isReactionsListOpen, userProfilesCache]);


  const handleReaction = useCallback((newType: ReactionType) => {
    if (!user) return;
    setIsPopoverOpen(false);

    const oldType = myReaction?.type;
    const isUnReacting = oldType === newType;

    // --- Visual Optimistic UI Update ---
    setIsAnimating(true);
    setOptimisticReactionType(isUnReacting ? null : newType);
    setTimeout(() => setIsAnimating(false), 400);

    const postRef = doc(db, 'posts', post.id);
    const reactionRef = doc(db, 'posts', post.id, 'reactions', user.uid);

    const updates: { [key: string]: any } = {};

    if (oldType) {
        updates[`reactionCounts.${oldType}`] = increment(-1);
    }

    if (!isUnReacting) {
        setDoc(reactionRef, { 
            userId: user.uid, 
            userName: profile?.fullName || user.displayName || 'Anonymous', 
            userPhotoUrl: profile?.photoUrl || null,
            type: newType, 
            createdAt: serverTimestamp() 
        });
        updates[`reactionCounts.${newType}`] = increment(1);
    } else {
        deleteDoc(reactionRef);
    }

    if (Object.keys(updates).length > 0) {
        updateDoc(postRef, updates).catch(err => {
            console.error("Failed to update reaction counts", err);
            setOptimisticReactionType(oldType || null);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update reaction.' });
        });
    }
  }, [user, myReaction, post.id, profile, toast]);

  const handleLikeTap = useCallback(() => {
    if (optimisticReactionType) {
        handleReaction(optimisticReactionType);
    } else {
        handleReaction('LIKE');
    }
  }, [optimisticReactionType, handleReaction]);

  const handlePointerDown = useCallback(() => {
    isLongPressRef.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPressRef.current = true;
      setIsPopoverOpen(true);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLongPressRef.current) {
      handleLikeTap();
    }
  }, [handleLikeTap]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    const commentText = newComment.trim();
    setNewComment('');

    try {
      const commentsRef = collection(db, 'posts', post.id, 'comments');
      await addDoc(commentsRef, {
        userId: user.uid,
        userName: profile?.fullName || user.displayName || 'Anonymous',
        text: commentText,
        createdAt: serverTimestamp(),
        likeCount: 0
      });
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, { commentCount: increment(1) });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not post comment.' });
    }
  };

  const handleDeletePost = async () => {
    if (user?.uid !== post.userId || profile?.role !== 'OWNER') return;
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    
    try {
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, { isDeleted: true });
      toast({ title: 'Post deleted.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete post.' });
    }
  };
  
  const handleUpdateComment = useCallback(async (commentId: string, newText: string) => {
    const commentRef = doc(db, 'posts', post.id, 'comments', commentId);
    try {
      await updateDoc(commentRef, {
        text: newText,
        updatedAt: serverTimestamp(),
        isEdited: true
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not update comment.' });
    }
  }, [post.id, toast]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    const commentRef = doc(db, 'posts', post.id, 'comments', commentId);
    const postRef = doc(db, 'posts', post.id);
    try {
      await deleteDoc(commentRef);
      await updateDoc(postRef, { commentCount: increment(-1) });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete comment.' });
    }
  }, [post.id, toast]);

  const { totalReactions, topReactions, reactionsText } = useMemo(() => {
    const counts = { ...(post.reactionCounts || {}) };
    
    const total = Object.values(counts).reduce((sum, count) => sum + (count || 0), 0);
    const top = Object.entries(counts)
      .filter(([, count]) => (count || 0) > 0)
      .sort(([, a], [, b]) => (b || 0) - (a || 0))
      .slice(0, 3)
      .map(([type]) => type as ReactionType);
    
    let text = "";
    if (total > 0) {
        if (optimisticReactionType) {
            text = total === 1 ? "You" : (total === 2 ? "You and 1 other" : `You and ${total - 1} others`);
        } else {
            text = `${total}`;
        }
    }

    return { totalReactions: total, topReactions: top, reactionsText: text };
  }, [post.reactionCounts, optimisticReactionType]);

  return (
    <Card className="shadow-sm border-none sm:border sm:shadow-none overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-3 p-3 sm:p-4">
        <Link href={`/dashboard/profile/${post.userId}`} className="flex-shrink-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={author?.photoUrl ?? undefined} />
            <AvatarFallback>{getInitials(author?.fullName || post.userName)}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/dashboard/profile/${post.userId}`} className="font-bold text-sm hover:underline truncate block">
            {author?.fullName || post.userName}
          </Link>
          <p className="text-[10px] text-muted-foreground truncate">
            {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : '...'}
          </p>
        </div>
        {user?.uid === post.userId && profile?.role === 'OWNER' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"><MoreHorizontal className="h-5 w-5 text-muted-foreground" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDeletePost} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete Post</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="px-3 sm:px-4 py-0 pb-3">
        {post.text && <p className="text-sm whitespace-pre-wrap mb-3 leading-snug break-words">{post.text}</p>}
        {post.imageUrl && (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden -mx-3 sm:mx-0 sm:rounded-md bg-muted">
            <Image src={post.imageUrl} alt="Post image" layout="fill" objectFit="contain" />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 p-3 sm:p-4 sm:pt-2">
        {(totalReactions > 0 || post.commentCount > 0) && (
            <div className="flex justify-between items-center w-full text-muted-foreground text-[12px] h-6">
                <div className="flex items-center gap-1 cursor-pointer hover:underline min-w-0 flex-1" onClick={() => setIsReactionsListOpen(true)}>
                    <div className="flex -space-x-1 mr-1 flex-shrink-0">
                        {topReactions.map(type => (
                            <div key={type} className="rounded-full border border-background bg-background h-4 w-4 flex items-center justify-center shadow-sm">
                                {React.cloneElement(reactionIcons[type] as React.ReactElement, { className: 'h-2.5 w-2.5' })}
                            </div>
                        ))}
                    </div>
                    <span className="truncate">{reactionsText}</span>
                </div>
                {post.commentCount > 0 && (
                    <span className="hover:underline cursor-pointer flex-shrink-0 ml-2" onClick={() => setIsCommentsOpen(true)}>
                        {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
                    </span>
                )}
            </div>
        )}
        <Separator className="bg-border/50" />
        <div className="flex w-full">
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
              <button 
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onPointerCancel={handlePointerLeave}
                onClick={handleButtonClick}
                className="flex-1 h-9 rounded-md flex items-center justify-center gap-2 hover:bg-muted transition-colors active:scale-95 duration-100"
              >
                {optimisticReactionType ? (
                  <span className={cn(
                    'flex items-center gap-2 font-bold text-xs', 
                    reactionColors[optimisticReactionType],
                    isAnimating && "animate-like-bounce"
                  )}>
                    {React.cloneElement(reactionIcons[optimisticReactionType] as React.ReactElement, { className: 'h-4 w-4' })}
                    {optimisticReactionType}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground font-bold text-xs">
                    <ThumbsUp className="h-4 w-4" /> Like
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-auto p-1 rounded-full shadow-2xl border-none bg-background/95 backdrop-blur-sm animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200">
              <div className="flex gap-1.5 p-1 px-2">
                {ReactionTypes.map(type => (
                  <button 
                    key={type} 
                    className="rounded-full h-10 w-10 flex items-center justify-center hover:scale-125 hover:-translate-y-1 transition-all duration-200 active:scale-110" 
                    onClick={(e) => { e.stopPropagation(); handleReaction(type); }}
                    title={type}
                  >
                    {reactionIcons[type]}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <button 
            className="flex-1 h-9 rounded-md flex items-center justify-center gap-2 hover:bg-muted transition-colors text-muted-foreground font-bold text-xs"
            onClick={() => setIsCommentsOpen(true)}
          >
            <MessageCircle className="h-4 w-4" /> Comment
          </button>
        </div>
        
        {/* Quick Comment Input */}
        <div className="w-full flex items-center gap-2 mt-1">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={profile?.photoUrl || undefined} />
            <AvatarFallback>{getInitials(profile?.fullName || user?.displayName || '')}</AvatarFallback>
          </Avatar>
          <form onSubmit={handleAddComment} className="flex-1 flex items-center relative">
            <input
                placeholder={`Write a comment...`}
                className="w-full bg-muted hover:bg-muted/80 focus:bg-muted rounded-full px-4 py-2 text-sm outline-none transition-colors"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
            />
            <button type="submit" disabled={!newComment.trim()} className="absolute right-3 text-primary disabled:opacity-30">
                <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </CardFooter>

      {/* --- ALL COMMENTS DIALOG --- */}
      <Dialog open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
        <DialogContent className="max-w-xl p-0 h-[80vh] flex flex-col focus:outline-none">
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-center text-sm font-bold">Comments</DialogTitle>
                <div className="absolute right-4 top-4">
                    <DialogClose asChild><button className="rounded-full h-8 w-8 flex items-center justify-center bg-muted hover:bg-muted/80"><X className="h-4 w-4"/></button></DialogClose>
                </div>
            </DialogHeader>
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {comments.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground">No comments yet.</div>
                    ) : (
                        comments.map(comment => (
                            <CommentItem 
                                key={comment.id}
                                comment={comment}
                                postId={post.id}
                                postOwnerId={post.userId}
                                profile={userProfilesCache.get(comment.userId)}
                                onDelete={handleDeleteComment}
                                onUpdate={handleUpdateComment}
                            />
                        ))
                    )}
                </div>
            </ScrollArea>
            <div className="p-4 border-t bg-background">
                <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={profile?.photoUrl || undefined} />
                        <AvatarFallback>{getInitials(profile?.fullName || user?.displayName || '')}</AvatarFallback>
                    </Avatar>
                    <form onSubmit={handleAddComment} className="flex-1 flex items-center relative">
                        <input
                            placeholder="Write a comment..."
                            className="w-full bg-muted rounded-full px-4 py-2 text-sm outline-none"
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" disabled={!newComment.trim()} className="absolute right-3 text-primary disabled:opacity-30">
                            <Send className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* --- REACTIONS LIST DIALOG --- */}
      <Dialog open={isReactionsListOpen} onOpenChange={setIsReactionsListOpen}>
        <DialogContent className="max-md p-0 h-[60vh] flex flex-col focus:outline-none">
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-center text-sm font-bold">People who reacted</DialogTitle>
                <div className="absolute right-4 top-4">
                    <DialogClose asChild><button className="rounded-full h-8 w-8 flex items-center justify-center bg-muted hover:bg-muted/80"><X className="h-4 w-4"/></button></DialogClose>
                </div>
            </DialogHeader>
            <ScrollArea className="flex-1">
                <div className="p-2">
                    {reactions.map(react => {
                        const reactorProfile = userProfilesCache.get(react.userId);
                        return (
                            <Link key={react.userId} href={`/dashboard/profile/${react.userId}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="relative flex-shrink-0">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={reactorProfile?.photoUrl || react.userPhotoUrl || undefined} />
                                            <AvatarFallback>{getInitials(reactorProfile?.fullName || react.userName || '')}</AvatarFallback>
                                        </Avatar>
                                        <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow-sm border">
                                            {React.cloneElement(reactionIcons[react.type] as React.ReactElement, { className: 'h-3 w-3' })}
                                        </div>
                                    </div>
                                    <span className="font-bold text-sm truncate">{reactorProfile?.fullName || react.userName || 'Anonymous'}</span>
                                </div>
                                <Button variant="ghost" size="sm" className="bg-muted hover:bg-muted/80 h-8 px-3 text-xs font-bold flex-shrink-0 ml-2">View Profile</Button>
                            </Link>
                        );
                    })}
                </div>
            </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
