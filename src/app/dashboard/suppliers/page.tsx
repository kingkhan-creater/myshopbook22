import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

export default function SuppliersPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
           <div>
            <CardTitle className="text-3xl font-bold tracking-tight">Suppliers</CardTitle>
            <CardDescription>Manage your list of suppliers.</CardDescription>
          </div>
           <Button disabled>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Supplier
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 min-h-[300px]">
            <h3 className="text-xl font-semibold">Coming Soon</h3>
            <p className="text-muted-foreground mt-2">The ability to add and manage suppliers is under construction.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
