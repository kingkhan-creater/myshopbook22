'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  doc,
  getDoc,
  setDoc,
  addDoc,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface PublicUserProfile {
  uid: string;
  fullName: string;
  shopName?: string;
  photoURL?: string; // from local storage
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

const createChatId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};

export default function ChatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();

  const peerId = params.peerId as string;
  const chatId = useMemo(() => user ? createChatId(user.uid, peerId) : '', [user, peerId]);

  const [peerProfile, setPeerProfile] = useState<PublicUserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch peer profile and check friendship
  useEffect(() => {
    if (!user || !peerId) return;

    const fetchInitialData = async () => {
      setLoading(true);
      try {
        // 1. Check friendship status
        const friendshipRef = doc(db, 'friendships', createChatId(user.uid, peerId));
        const friendshipSnap = await getDoc(friendshipRef);

        if (friendshipSnap.exists() && friendshipSnap.data().status === 'accepted') {
          setIsFriend(true);
        } else {
          setIsFriend(false);
          toast({
            variant: 'destructive',
            title: 'Not Friends',
            description: 'You can only chat with users you are friends with.',
          });
          router.replace('/dashboard/friends');
          return;
        }

        // 2. Fetch peer's public profile
        const userDocRef = doc(db, 'publicUsers', peerId);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const profileData = { uid: peerId, ...userDocSnap.data() } as PublicUserProfile;
          const storedPhoto = localStorage.getItem(`profilePhoto_${peerId}`);
          if (storedPhoto) {
            profileData.photoURL = storedPhoto;
          }
          setPeerProfile(profileData);
        } else {
          throw new Error('Peer user profile not found.');
        }

      } catch (error: any) {
        console.error("Error fetching chat data:", error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to load chat: ${error.message}`,
        });
        router.replace('/dashboard/friends');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [user, peerId, router, toast]);

  // Set up messages listener
  useEffect(() => {
    if (!chatId || !isFriend) return;

    const messagesQuery = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(newMessages);
    }, (error) => {
      console.error("Error listening to messages:", error);
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: 'Could not listen for new messages.',
      });
    });

    return () => unsubscribe();
  }, [chatId, isFriend, toast]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !chatId || newMessage.trim() === '') return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      // 1. Add message to subcollection
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        senderId: user.uid,
        text: messageText,
        type: 'text',
        createdAt: serverTimestamp(),
        seenBy: [user.uid],
      });

      // 2. Update the main chat document (for chat list previews)
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
          members: [user.uid, peerId],
          lastMessage: messageText,
          lastMessageAt: serverTimestamp(),
        }, { merge: true }
      );
      
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not send message.',
      });
      // Optionally reset the input to allow user to retry
      setNewMessage(messageText);
    }
  };

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  if (loading) {
    return (
      <div className="flex h-full flex-col p-4">
        <Skeleton className="h-12 w-1/3 mb-4" />
        <div className="flex-grow space-y-4">
          <Skeleton className="h-10 w-2/3 self-start rounded-lg" />
          <Skeleton className="h-10 w-1/2 self-end rounded-lg" />
          <Skeleton className="h-16 w-3/4 self-start rounded-lg" />
        </div>
        <Skeleton className="h-10 w-full mt-4" />
      </div>
    );
  }
  
  if (!isFriend) {
    return null; // Or a message saying not friends
  }

  return (
    <div className="flex h-full max-h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 border-b bg-background p-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/friends">
            <ArrowLeft />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        {peerProfile && (
           <div className="flex items-center gap-3">
             <Avatar>
               <AvatarImage src={peerProfile.photoURL ?? undefined} />
               <AvatarFallback>{getInitials(peerProfile.fullName)}</AvatarFallback>
             </Avatar>
             <div className="flex flex-col">
              <span className="font-semibold">{peerProfile.fullName}</span>
              {peerProfile.shopName && <span className="text-sm text-muted-foreground">{peerProfile.shopName}</span>}
             </div>
           </div>
        )}
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex items-end gap-2 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs rounded-lg px-4 py-2 md:max-w-md ${
                msg.senderId === user?.uid
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="text-sm">{msg.text}</p>
            </div>
          </div>
        ))}
         <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="border-t bg-background p-4">
        <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            autoComplete="off"
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()}>
            <Send />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </footer>
    </div>
  );
}
