'use client';

import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, Users, Truck, Bell } from 'lucide-react';
import Link from 'next/link';

const overviewCards = [
  { title: 'Items', description: 'Manage inventory', icon: Package, href: '/dashboard/items' },
  { title: 'Customers', description: 'View customers', icon: Users, href: '/dashboard/customers' },
  { title: 'Suppliers', description: 'Manage suppliers', icon: Truck, href: '/dashboard/suppliers' },
  { title: 'Reminders', description: 'Track tasks', icon: Bell, href: '/dashboard/reminders' },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {user?.displayName || 'User'}!
        </h1>
        <p className="text-muted-foreground">
          Here's a quick overview of your shop.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {overviewCards.map((card) => (
            <Link key={card.title} href={card.href}>
              <Card className="hover:bg-card/90 hover:shadow-md transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">...</div>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>A log of recent activities will be shown here.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 min-h-[200px]">
                    <h3 className="text-lg font-semibold">No Recent Activity</h3>
                    <p className="text-muted-foreground mt-2">Your recent updates will appear here.</p>
                </div>
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
