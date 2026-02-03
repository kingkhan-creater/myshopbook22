import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PlusCircle } from 'lucide-react';

const mockCustomers = [
  { id: '1', name: 'Alice Johnson', email: 'alice@example.com', totalSpent: 450.75 },
  { id: '2', name: 'Bob Williams', email: 'bob@example.com', totalSpent: 120.00 },
  { id: '3', name: 'Charlie Brown', email: 'charlie@example.com', totalSpent: 890.50 },
];

export default function CustomersPage() {
  const getInitials = (name: string) => (name || '').substring(0, 2).toUpperCase();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">Customers</CardTitle>
            <CardDescription>View and manage your customer relationships.</CardDescription>
          </div>
           <Button disabled>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Customer
          </Button>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Full functionality for adding and managing customers will be implemented soon.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Total Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">${customer.totalSpent.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
