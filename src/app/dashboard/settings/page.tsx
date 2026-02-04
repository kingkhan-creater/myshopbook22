'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Users, Store, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';


export default function SettingsPage() {
  // This state is local to the settings page for now.
  // A shared state management (Context or Zustand) would be needed to make it affect other pages.
  const [view, setView] = useState<'user' | 'customer'>('user');

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">Settings</CardTitle>
          <CardDescription>Manage your application settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Card>
            <CardHeader>
                <CardTitle>View Settings</CardTitle>
                <CardDescription>Control how you see your items and data.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="view-mode" className="text-base">Inventory View</Label>
                        <p className="text-sm text-muted-foreground">
                            Switch between owner view (with costs) and customer view (sales-focused).
                        </p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <Switch id="view-mode" checked={view === 'user'} onCheckedChange={(c) => setView(c ? 'user' : 'customer')} />
                        <Store className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm font-medium">{view === 'user' ? 'Owner View' : 'Customer View'}</p>
                    </div>
                </div>
                 <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="language-toggle" className="text-base">Language</Label>
                        <p className="text-sm text-muted-foreground">
                           Change the display language of the application.
                        </p>
                    </div>
                    <Button variant="outline" size="icon" disabled><Languages /></Button>
                </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
