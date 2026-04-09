import type { ColumnDef } from '@tanstack/react-table';
import type { Client } from '@/types';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      // We don't have a details page yet, but preparing the Link for the future
      return <span className="font-medium text-primary">{row.getValue('name')}</span>;
    }
  },
  {
    accessorKey: 'industry',
    header: 'Industry',
    cell: ({ row }) => {
      return <span>{row.getValue('industry') || 'N/A'}</span>;
    }
  },
  {
    accessorKey: 'contactName',
    header: 'Contact Name',
  },
  {
    accessorKey: 'contactEmail',
    header: 'Contact Email',
  },
  {
    accessorKey: 'createdAt',
    header: 'Created On',
    cell: ({ row }) => {
      const dateStr = row.getValue('createdAt') as Date;
      if (!dateStr) return 'N/A';
      return <span>{format(new Date(dateStr), 'MMM dd, yyyy')}</span>;
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const client = row.original;

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
            <DropdownMenuItem className="text-destructive">Delete client</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
