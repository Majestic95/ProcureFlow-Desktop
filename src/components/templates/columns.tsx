import type { ColumnDef } from '@tanstack/react-table';
import type { RfpTemplate } from '@/types';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DeleteTemplateDialog } from './delete-template-dialog';

export const columns: ColumnDef<RfpTemplate>[] = [
  {
    id: 'actions',
    cell: ({ row }) => {
      const template = row.original;

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
              <Link to={`/dashboard/templates/${template.id}/edit`}>Edit Template</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteTemplateDialog template={template}>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive"
              >
                Delete Template
              </DropdownMenuItem>
            </DeleteTemplateDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
        return <Link to={`/dashboard/templates/${row.original.id}/edit`} className="font-medium text-primary hover:underline">{row.getValue('name')}</Link>
    }
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
        const type = row.getValue('type') as string;
        return (
          <Badge variant={type === 'document' ? 'default' : 'outline'} className="capitalize">
            {type || 'email'}
          </Badge>
        );
    }
  },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => {
        const category = row.getValue('category') as string;
        if (!category) return null;
        return <Badge variant="secondary">{category}</Badge>;
    }
  },
  {
    accessorKey: 'subject',
    header: 'Subject',
  },
  {
    accessorKey: 'language',
    header: 'Language',
  },
  {
    accessorKey: 'updatedAt',
    header: 'Last Updated',
    cell: ({ row }) => {
      const date = row.getValue('updatedAt') as Date;
      return <span>{format(date, 'MMM d, yyyy')}</span>;
    },
  },
];
