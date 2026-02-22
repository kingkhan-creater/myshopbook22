
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { Loader2, LogOut, User as UserIcon, Menu, WifiOff, Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useEffect, useState, useRef, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { DashboardNav } from '@/components/dashboard-nav';
import Link from 'next/link';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { Badge } from '@/components/ui/badge';
import type { Notification } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      setNotifications([]); // Clear notifications on logout
      return;
    }

    // Query for unread notifications only
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(notifsData);
    }, (error) => {
      console.error("Firestore (11.9.0): Uncaught Error in snapshot listener:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.length;

  // The click handler now only navigates. The 'read' action is handled in the chat page.
  const handleNotificationClick = (notification: Notification) => {
    router.push(notification.link || '#');
  };

  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute top-1 right-1 h-5 w-5 p-0 flex items-center justify-center text-xs" variant="destructive">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 md:w-96" align="end">
        <DropdownMenuLabel className="flex justify-between items-center">
          <span>Notifications</span>
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount} new</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[350px]">
          {notifications.length > 0 ? (
            notifications.map(notif => (
              <DropdownMenuItem
                key={notif.id}
                onSelect={(e) => {
                  e.preventDefault(); // Prevent dropdown from closing immediately
                  handleNotificationClick(notif);
                }}
                className={cn(
                  "p-0 focus:bg-accent cursor-pointer data-[highlighted]:bg-accent"
                )}
              >
                <div className="flex w-full items-start gap-3 p-3">
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarImage src={notif.senderPhotoUrl ?? undefined} />
                    <AvatarFallback>{getInitials(notif.senderName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm break-words">
                      <span className="font-semibold">{notif.senderName}</span> {notif.text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notif.createdAt ? formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true }) : '...'}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">You're all caught up!</p>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (!loading && (!user || !user.emailVerified)) {
      router.replace('/login');
    }
    if (user) {
      const fetchUserProfile = async () => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().photoUrl) {
          setPhotoURL(userDocSnap.data().photoUrl);
        }
      };
      fetchUserProfile();
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast({
        title: 'Logged Out',
        description: 'You have been successfully logged out.',
      });
      router.replace('/login');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Logout Failed',
        description: 'There was a problem logging you out.',
      });
    }
  };

  const handlePhotoUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;
      const img = document.createElement("img");
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        
        if (dataUrl.length > 300 * 1024) {
            toast({
                variant: "destructive",
                title: "Image is too large",
                description: "Please select an image smaller than 300KB.",
            });
            return;
        }

        try {
          const userDocRef = doc(db, 'users', user.uid);
          const publicUserDocRef = doc(db, 'publicUsers', user.uid);
          
          await updateDoc(userDocRef, { photoUrl: dataUrl });
          await updateDoc(publicUserDocRef, { photoUrl: dataUrl });

          setPhotoURL(dataUrl);
          toast({
            title: "Photo Updated",
            description: "Your profile photo has been updated.",
          });
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Could not save photo",
            description: "There was an error saving your photo. Please try again.",
          });
          console.error("Failed to save photo to Firestore:", error);
        }
      };
      img.src = e.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getInitials = (email: string | null | undefined) => {
    if (!email) return 'U';
    return email.substring(0, 2).toUpperCase();
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-sidebar md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-16 items-center border-b px-6">
            <Logo />
          </div>
          <div className="flex-1 overflow-auto py-2">
            <DashboardNav className="px-4 text-sm font-medium" />
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <header className="flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex h-16 items-center border-b px-4">
                <Logo />
              </div>
              <DashboardNav className="p-4" />
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1 flex items-center">
            {!isOnline && (
              <Badge variant="destructive" className="flex items-center gap-2">
                <WifiOff className="h-4 w-4" />
                Offline Mode
              </Badge>
            )}
          </div>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10 border-2 border-primary">
                  <AvatarImage src={photoURL ?? ''} alt="Profile Photo" />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(user.email)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuItem asChild className="cursor-pointer focus:bg-accent focus:text-accent-foreground">
                <Link href={`/dashboard/profile/${user.uid}`} className="flex flex-col space-y-1 w-full items-start p-2">
                  <p className="text-sm font-medium leading-none">{user.displayName || 'My Account'}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
               <DropdownMenuItem onClick={handlePhotoUploadClick} className="cursor-pointer">
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Change Photo</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex flex-1 flex-col gap-4 bg-muted/40 overflow-auto">
          {children}
        </main>
         <input
          type="file"
          ref={fileInputRef}
          onChange={handlePhotoChange}
          className="hidden"
          accept="image/*"
        />
      </div>
    </div>
  );
}
