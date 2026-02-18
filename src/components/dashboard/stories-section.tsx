'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, addDoc, Timestamp } from 'firebase/firestore';
import type { Story, PublicUserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { add } from 'date-fns';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { PlusCircle, Loader2, Camera, X } from 'lucide-react';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

// --- Story Creator Component (Dialog) ---
const StoryCreator = ({ open, onOpenChange, onStoryCreated }: { open: boolean, onOpenChange: (open: boolean) => void, onStoryCreated: () => void }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [text, setText] = useState('');
    const [photoBase64, setPhotoBase64] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (!e.target?.result) return;
            const img = new (window.Image)();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1080;
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
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleCreateStory = async () => {
        if (!user || !photoBase64) {
            toast({ variant: 'destructive', title: 'Photo required', description: 'Please select a photo for your story.' });
            return;
        }
        setIsSaving(true);
        try {
            const userPublicProfileSnap = await getDocs(query(collection(db, 'publicUsers'), where('__name__', '==', user.uid)));
            
            let userPhotoUrl: string | undefined;
            if(!userPublicProfileSnap.empty){
                userPhotoUrl = (userPublicProfileSnap.docs[0].data() as PublicUserProfile).photoUrl;
            }

            const now = new Date();
            const expiresAt = add(now, { hours: 24 });
            
            await addDoc(collection(db, 'stories'), {
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userPhotoUrl: userPhotoUrl || null,
                imageUrl: photoBase64,
                text: text.trim(),
                createdAt: Timestamp.fromDate(now),
                expiresAt: Timestamp.fromDate(expiresAt),
            });

            toast({ title: 'Story posted!' });
            onStoryCreated();
            setText('');
            setPhotoBase64(null);
            if (photoInputRef.current) photoInputRef.current.value = '';
        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not post story.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Create a new Story</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <Textarea placeholder="Add a caption..." value={text} onChange={(e) => setText(e.target.value)} />
                    <div>
                        {photoBase64 ? (
                            <div className="relative">
                                <Image src={photoBase64} alt="Story preview" width={400} height={400} className="rounded-md mx-auto" />
                                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => setPhotoBase64(null)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input type="file" accept="image/*" onChange={handlePhotoChange} className="pl-10" ref={photoInputRef}/>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleCreateStory} disabled={isSaving || !photoBase64}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Post Story
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// --- Story Viewer Component (Dialog) ---
const StoryViewer = ({ open, onOpenChange, userStories }: { open: boolean, onOpenChange: (open: boolean) => void, userStories: Story[] | null }) => {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);
    const [progress, setProgress] = useState(0);

    // Sync current slide index
    useEffect(() => {
        if (!api) return;
        api.on("select", () => {
            setCurrent(api.selectedScrollSnap());
            setProgress(0);
        });
    }, [api]);
    
    // Reset progress when opening or changing users
    useEffect(() => {
        if (open) {
            setProgress(0);
            setCurrent(0);
            api?.scrollTo(0, true);
        }
    }, [open, api, userStories]);

    // Timer logic for progress bar
    useEffect(() => {
        if (!open || !api) return;

        const interval = setInterval(() => {
            setProgress((prev) => (prev < 100 ? prev + 1 : 100));
        }, 50); // 5 seconds total per story (50ms * 100)

        return () => clearInterval(interval);
    }, [open, api]);

    // Handle auto-advance when progress hits 100
    useEffect(() => {
        if (progress >= 100 && api) {
            if (api.canScrollNext()) {
                api.scrollNext();
            } else {
                onOpenChange(false);
            }
        }
    }, [progress, api, onOpenChange]);


    if (!userStories || userStories.length === 0) return null;

    const author = { 
        name: userStories[0].userName, 
        photoUrl: userStories[0].userPhotoUrl 
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 border-0 bg-black max-w-md h-full md:h-[90vh] md:max-h-[800px] flex flex-col focus:outline-none overflow-hidden">
                 <DialogHeader className="sr-only">
                    <DialogTitle>Story from {author.name}</DialogTitle>
                 </DialogHeader>
                 
                 {/* Top Progress and Header Info */}
                 <div className="absolute top-0 left-0 right-0 p-4 z-30 bg-gradient-to-b from-black/60 to-transparent">
                    <div className="flex items-center gap-1.5 mb-3">
                        {userStories.map((_, index) => (
                            <Progress key={index} value={index === current ? progress : (index < current ? 100 : 0)} className="h-1 flex-1 bg-white/20" />
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-white/50">
                            <AvatarImage src={author.photoUrl ?? undefined} />
                            <AvatarFallback>{getInitials(author.name)}</AvatarFallback>
                        </Avatar>
                        <p className="font-semibold text-white text-sm shadow-black drop-shadow-md">{author.name}</p>
                    </div>
                 </div>

                {/* Main Content Carousel */}
                <div className="relative flex-1 w-full h-full bg-black">
                    <Carousel setApi={setApi} className="w-full h-full">
                        <CarouselContent className="h-full">
                            {userStories.map((story) => (
                                <CarouselItem key={story.id} className="h-full relative">
                                    <div className="relative w-full h-full flex items-center justify-center">
                                       <Image 
                                            src={story.imageUrl} 
                                            alt={story.text || 'Story'} 
                                            fill 
                                            className="object-contain" 
                                            priority
                                        />
                                       {story.text && (
                                            <div className="absolute bottom-20 left-0 right-0 p-6 text-center z-10">
                                                <p className="inline-block px-4 py-2 rounded-lg text-white text-base font-medium bg-black/50 backdrop-blur-sm">
                                                    {story.text}
                                                </p>
                                            </div>
                                       )}
                                    </div>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        
                        {/* Interaction Layers */}
                        <div className="absolute inset-0 flex z-20">
                             <button onClick={() => api?.scrollPrev()} className="h-full w-1/3 cursor-pointer" aria-label="Previous story" />
                             <button className="h-full w-1/3 cursor-default" />
                             <button onClick={() => api?.scrollNext()} className="h-full w-1/3 cursor-pointer" aria-label="Next story" />
                        </div>
                    </Carousel>
                </div>

                <DialogClose className="absolute right-4 top-12 z-40 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 transition-colors">
                    <X className="h-5 w-5" />
                </DialogClose>
            </DialogContent>
        </Dialog>
    );
};


// --- Main StoriesSection Component ---
export function StoriesSection() {
    const { user } = useAuth();
    const [storiesByUser, setStoriesByUser] = useState<Map<string, Story[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);
    const [viewingUser, setViewingUser] = useState<string | null>(null);

    useEffect(() => {
        const storiesQuery = query(collection(db, 'stories'), where('expiresAt', '>', new Date()), orderBy('expiresAt', 'desc'));
        const unsubscribe = onSnapshot(storiesQuery, (snapshot) => {
            const fetchedStories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story));
            
            const grouped = new Map<string, Story[]>();
            fetchedStories.forEach(story => {
                const userStories = grouped.get(story.userId) || [];
                userStories.push(story);
                grouped.set(story.userId, userStories);
            });

            // Sort stories for each user by creation date
            for (let key of grouped.keys()) {
                grouped.get(key)?.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
            }

            setStoriesByUser(grouped);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleViewUserStories = (userId: string) => {
        setViewingUser(userId);
    };
    
    const sortedUsersWithStories = useMemo(() => {
        return Array.from(storiesByUser.keys()).sort((a, b) => {
            if (a === user?.uid) return -1;
            if (b === user?.uid) return 1;
            return 0;
        });
    }, [storiesByUser, user?.uid]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Stories</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex space-x-4">
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <Skeleton className="h-16 w-16 rounded-full" />
                    </div>
                ) : (
                     <ScrollArea className="w-full whitespace-nowrap">
                        <div className="flex w-max space-x-4 p-4">
                             {/* Add Story Button */}
                            <div className="flex flex-col items-center gap-2">
                                <button onClick={() => setIsCreatorOpen(true)} className="h-16 w-16 rounded-full border-2 border-dashed border-primary flex items-center justify-center text-primary hover:bg-primary/10 transition-colors">
                                    <PlusCircle className="h-8 w-8" />
                                </button>
                                <p className="text-xs font-medium w-16 truncate text-center">Add Story</p>
                            </div>
                            
                            {/* User Stories */}
                            {sortedUsersWithStories.map(userId => {
                                const userStories = storiesByUser.get(userId);
                                if (!userStories || userStories.length === 0) return null;
                                const userDetails = userStories[0];
                                return (
                                    <div key={userId} className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => handleViewUserStories(userId)}>
                                        <div className="relative h-16 w-16 rounded-full border-2 border-primary p-0.5 group-hover:scale-105 transition-transform">
                                            <Avatar className="h-full w-full">
                                                <AvatarImage src={userDetails.userPhotoUrl ?? undefined} className="object-cover" />
                                                <AvatarFallback>{getInitials(userDetails.userName)}</AvatarFallback>
                                            </Avatar>
                                        </div>
                                        <p className="text-xs font-medium w-16 truncate text-center">{userDetails.userName}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                )}
            </CardContent>

            <StoryCreator 
                open={isCreatorOpen} 
                onOpenChange={setIsCreatorOpen}
                onStoryCreated={() => setIsCreatorOpen(false)}
            />

            <StoryViewer 
                open={!!viewingUser}
                onOpenChange={(open) => !open && setViewingUser(null)}
                userStories={viewingUser ? storiesByUser.get(viewingUser) || null : null}
            />
        </Card>
    );
}
