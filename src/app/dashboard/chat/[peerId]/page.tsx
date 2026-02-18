'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  deleteField,
} from 'firebase/firestore';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Send, Paperclip, Image as ImageIcon, Package, MoreVertical, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import Image from 'next/image';
import type { Message, Item, ItemSnapshot } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface PublicUserProfile {
  uid: string;
  fullName: string;
  shopName?: string;
  photoUrl?: string;
}

const createChatId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};

const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

const SharedItemCard = ({ item }: { item: ItemSnapshot }) => (
  <div className="flex items-center gap-3 rounded-lg border p-3 bg-card">
     {item.photoBase64 ? (
      <div className="relative h-16 w-16 flex-shrink-0 rounded-md overflow-hidden">
        <Image src={item.photoBase64} alt={item.name} layout="fill" objectFit="cover" />
      </div>
     ) : (
      <div className="relative h-16 w-16 flex-shrink-0 rounded-md bg-muted flex items-center justify-center">
        <Package className="h-8 w-8 text-muted-foreground" />
      </div>
     )}
    <div>
      <p className="font-semibold">{item.name}</p>
      <p className="text-sm font-bold text-primary">${item.salePrice.toFixed(2)}</p>
    </div>
  </div>
);

export default function ChatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ peerId: string }>();
  const { toast } = useToast();

  const peerId = params.peerId;
  const chatId = useMemo(() => (user ? createChatId(user.uid, peerId) : null), [user, peerId]);

  const [peerProfile, setPeerProfile] = useState<PublicUserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(false);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [userItems, setUserItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!user || !peerId || !chatId) return;

    let unsubscribeMessages: (() => void) | null = null;

    const setupChat = async () => {
      setLoading(true);
      try {
        const friendshipRef = doc(db, 'friendships', createChatId(user.uid, peerId));
        const friendshipSnap = await getDoc(friendshipRef);

        if (!friendshipSnap.exists() || friendshipSnap.data().status !== 'accepted') {
          setIsFriend(false);
          toast({ variant: 'destructive', title: 'Not Friends', description: 'You can only chat with users you are friends with.' });
          router.replace('/dashboard/friends');
          return;
        }
        setIsFriend(true);
        
        const userDocRef = doc(db, 'publicUsers', peerId);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          setPeerProfile({ uid: peerId, ...userDocSnap.data() } as PublicUserProfile);
        }

        const chatRef = doc(db, 'chats', chatId);
        await setDoc(chatRef, { members: [user.uid, peerId], createdAt: serverTimestamp() }, { merge: true });

        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
          const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
          setMessages(newMessages.filter(m => !(m.deletedFor?.includes(user.uid))));
        });

      } catch (error: any) {
        console.error("Chat Setup Error:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load chat.' });
      } finally { setLoading(false); }
    };

    setupChat();
    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [user, peerId, chatId, router, toast]);

  useEffect(() => {
    if (isItemDialogOpen && user) {
        setLoadingItems(true);
        const itemsQuery = query(collection(db, 'users', user.uid, 'items'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(itemsQuery, snapshot => {
            setUserItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
            setLoadingItems(false);
        });
        return () => unsubscribe();
    }
  }, [isItemDialogOpen, user]);

  const sendMessage = useCallback(async (messageData: Omit<Message, 'id' | 'senderId' | 'createdAt'>, lastMessageText: string) => {
    if (!user || !chatId) return;

    try {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await addDoc(messagesRef, { 
          ...messageData, 
          senderId: user.uid, 
          createdAt: serverTimestamp(),
          deletedForEveryone: false,
        });
        
        const chatRef = doc(db, 'chats', chatId);
        await setDoc(chatRef, { 
          lastMessage: lastMessageText, 
          lastMessageAt: serverTimestamp(), 
          members: [user.uid, peerId] 
        }, { merge: true });
    } catch (error) {
        console.error("Send Message Error:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not send message.' });
    }
  }, [user, chatId, peerId, toast]);

  const handleSendTextMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;
    const messageText = newMessage.trim();
    setNewMessage('');
    await sendMessage({ type: 'text', text: messageText }, messageText);
  };
  
  const handleSendItemMessage = async (item: Item) => {
    const itemSnapshot: ItemSnapshot = {
        name: item.name,
        salePrice: item.salePrice,
        ...(item.photoBase64 && { photoBase64: item.photoBase64 }),
    };
    await sendMessage({ type: 'item', itemSnapshot }, `[Item] ${item.name}`);
    setIsItemDialogOpen(false);
  };
  
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        if (!event.target?.result) return;
        const img = new (window.Image)();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
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
            await sendMessage({ type: 'image', imageUrl: dataUrl }, '[Photo]');
        };
        img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
    if(photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleDeleteForMe = async (messageId: string) => {
    if (!user || !chatId) return;
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    try {
        await updateDoc(messageRef, {
            deletedFor: arrayUnion(user.uid)
        });
        toast({ title: 'Message hidden for you.' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not hide message.' });
    }
  };

  const handleDeleteForEveryone = async (message: Message) => {
    if (!user || !chatId || message.senderId !== user.uid) return;
    const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
    try {
      await updateDoc(messageRef, {
        deletedForEveryone: true,
        deletedAt: serverTimestamp(),
        text: deleteField(),
        imageUrl: deleteField(),
        itemSnapshot: deleteField(),
        originalText: message.text || null,
        originalImageUrl: message.imageUrl || null,
        originalItemSnapshot: message.itemSnapshot || null,
      });
      toast({ title: 'Message deleted for everyone.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete message.'});
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col p-4">
        <Skeleton className="h-12 w-1/3 mb-4" />
        <div className="flex-grow space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-10 w-1/2 self-end" /><Skeleton className="h-16 w-3/4" /></div>
        <Skeleton className="h-10 w-full mt-4" />
      </div>
    );
  }
  
  if (!isFriend) return null;

  return (
    <div className="flex h-full max-h-[calc(100vh-4rem)] flex-col bg-background">
      <header className="flex items-center gap-4 border-b bg-background p-3">
        <Button variant="ghost" size="icon" asChild><Link href="/dashboard/friends"><ArrowLeft /><span className="sr-only">Back</span></Link></Button>
        {peerProfile && (
           <div className="flex items-center gap-3">
             <Avatar><AvatarImage src={peerProfile.photoUrl ?? undefined} /><AvatarFallback>{getInitials(peerProfile.fullName)}</AvatarFallback></Avatar>
             <div className="flex flex-col">
              <span className="font-semibold">{peerProfile.fullName}</span>
              {peerProfile.shopName && <span className="text-sm text-muted-foreground">{peerProfile.shopName}</span>}
             </div>
           </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={cn("group flex items-end gap-2", msg.senderId === user?.uid ? 'justify-end' : 'justify-start')}>
            {msg.senderId === user?.uid && (
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleDeleteForMe(msg.id)}><Trash2 className="mr-2 h-4 w-4"/>Delete for me</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteForEveryone(msg)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete for everyone</DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className={cn("max-w-xs md:max-w-md rounded-lg", msg.imageUrl ? 'p-0' : 'px-4 py-2', msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {msg.deletedForEveryone ? (
                <p className="text-sm italic text-muted-foreground">This message was deleted</p>
              ) : (
                <>
                  {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                  {msg.imageUrl && <Image src={msg.imageUrl} alt="Shared photo" width={300} height={300} className="rounded-lg object-cover" />}
                  {msg.itemSnapshot && <SharedItemCard item={msg.itemSnapshot} />}
                </>
              )}
               <p className="text-xs opacity-70 mt-1 px-1">{msg.createdAt ? formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true }) : ''}</p>
            </div>
            {msg.senderId !== user?.uid && (
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleDeleteForMe(msg.id)}><Trash2 className="mr-2 h-4 w-4"/>Delete for me</DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
         <div ref={messagesEndRef} />
      </main>

      <footer className="border-t bg-background p-4">
        <form onSubmit={handleSendTextMessage} className="flex w-full items-center gap-2">
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon"><Paperclip /></Button></PopoverTrigger>
                <PopoverContent className="w-auto p-2">
                    <div className="flex flex-col gap-2">
                        <Button variant="ghost" className="justify-start" onClick={() => { photoInputRef.current?.click(); setIsPopoverOpen(false); }}><ImageIcon className="mr-2 h-4 w-4" /> Share Photo</Button>
                        <Button variant="ghost" className="justify-start" onClick={() => { setIsItemDialogOpen(true); setIsPopoverOpen(false); }}><Package className="mr-2 h-4 w-4" /> Share Item</Button>
                    </div>
                </PopoverContent>
            </Popover>
          <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." autoComplete="off"/>
          <Button type="submit" size="icon" disabled={!newMessage.trim()}><Send /><span className="sr-only">Send</span></Button>
        </form>
      </footer>
      <input type="file" ref={photoInputRef} onChange={handlePhotoSelected} className="hidden" accept="image/*" />

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-h-[80vh]">
            <DialogHeader>
                <DialogTitle>Share an Item</DialogTitle>
                <DialogDescription>Select an item from your inventory to share in the chat.</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto space-y-2 p-1">
                {loadingItems ? <Skeleton className="h-24 w-full" /> : userItems.map(item => (
                    <Card key={item.id} className="cursor-pointer hover:bg-muted" onClick={() => handleSendItemMessage(item)}>
                        <CardContent className="p-3 flex items-center gap-4">
                            {item.photoBase64 ? <Image src={item.photoBase64} alt={item.name} width={64} height={64} className="rounded-md object-cover" /> : <div className="h-16 w-16 bg-muted rounded-md flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground"/></div>}
                            <div>
                                <p className="font-semibold">{item.name}</p>
                                <p className="text-sm text-primary font-bold">${item.salePrice.toFixed(2)}</p>
                                <p className="text-xs text-muted-foreground">Stock: {item.stockQty}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
