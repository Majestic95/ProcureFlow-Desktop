import type { ColumnDef } from '@tanstack/react-table';
import type { Supplier } from '@/types';
import { MoreHorizontal, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

import { DeleteSupplierDialog } from './delete-supplier-dialog';

export const columns: ColumnDef<Supplier>[] = [
  {
    accessorKey: 'logoUrl',
    header: 'Logo',
    cell: ({ row }) => {
        const logoUrl = row.getValue('logoUrl') as string;
        const companyName = row.original.companyName;
        return (
            <Avatar className="h-8 w-8">
                <AvatarImage src={logoUrl} alt={`${companyName} logo`} />
                <AvatarFallback>{companyName?.charAt(0)}</AvatarFallback>
            </Avatar>
        )
    }
  },
  {
    accessorKey: 'companyName',
    header: 'Company Name',
    cell: ({ row }) => {
      return <Link to={`/dashboard/suppliers/${row.original.id}`} className="font-medium text-primary hover:underline">{row.getValue('companyName')}</Link>
    }
  },
  {
    id: 'contactName',
    header: 'Primary Contact',
    accessorFn: row => row.contacts?.[0]?.name || '',
  },
  {
    id: 'email',
    header: 'Email',
    accessorFn: row => row.contacts?.[0]?.email || '',
  },
  {
    accessorKey: 'categories',
    header: 'Categories',
    cell: ({ row }) => {
      const categories = row.getValue('categories') as string[];
      if (!categories || categories.length === 0) return null;
      return (
        <div className="flex flex-wrap gap-1">
          {categories.slice(0, 3).map((category) => (
            <Badge key={category} variant="secondary">
              {category}
            </Badge>
          ))}
          {categories.length > 3 && <Badge variant="outline">+{categories.length - 3}</Badge>}
        </div>
      );
    },
  },
  {
    accessorKey: 'rating',
    header: 'Rating',
    cell: ({ row }) => {
      const rating = parseFloat(row.getValue('rating'));
      if (isNaN(rating)) return 'N/A';
      return (
        <div className="flex items-center">
          <Star className="mr-1 h-4 w-4 text-yellow-400 fill-yellow-400" />
          {rating.toFixed(1)}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const supplier = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
                <Link to={`/dashboard/suppliers/${supplier.id}`}>View details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link to={`/dashboard/suppliers/${supplier.id}/edit`}>Edit supplier</Link>
            </DropdownMenuItem>
            <DeleteSupplierDialog supplier={supplier}>
                <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                    Delete supplier
                </DropdownMenuItem>
            </DeleteSupplierDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
