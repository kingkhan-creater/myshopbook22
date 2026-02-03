import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle } from 'lucide-react';

const mockItems = [
  { id: '1', name: 'Vintage Leather Jacket', stock: 15, price: 120.00, status: 'In Stock' },
  { id: '2', name: 'Handmade Ceramic Mug', stock: 50, price: 25.50, status: 'In Stock' },
  { id: '3', name: 'Organic Cotton T-Shirt', stock: 0, price: 35.00, status: 'Out of Stock' },
  { id: '4', name: 'Artisan Sourdough Bread', stock: 5, price: 8.00, status: 'Low Stock' },
];

export default function ItemsPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">Available Items</CardTitle>
            <CardDescription>Manage your inventory and view stock levels.</CardDescription>
          </div>
          <Button disabled>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Item
          </Button>
        </CardHeader>
        <CardContent>
           <p className="text-sm text-muted-foreground mb-4">Full functionality for adding and managing items will be implemented soon.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.stock}</TableCell>
                  <TableCell>${item.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === 'In Stock' ? 'default' : item.status === 'Low Stock' ? 'secondary' : 'destructive'}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
