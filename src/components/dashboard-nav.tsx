'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Package, Users, Truck, Bell, MessageSquare, Wallet } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/items', label: 'Items', icon: Package },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/dashboard/reminders', label: 'Reminders', icon: Bell },
  { href: '/dashboard/expenses', label: 'Expenses', icon: Wallet },
  { href: '/dashboard/friends', label: 'Friends & Chat', icon: MessageSquare },
];

export function DashboardNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();

  return (
    <nav
      className={cn('flex flex-col gap-2', className)}
      {...props}
    >
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
