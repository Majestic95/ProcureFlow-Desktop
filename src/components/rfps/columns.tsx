import type { ColumnDef } from '@tanstack/react-table';
import type { RFP } from '@/types';
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
import { DeleteRFPDialog } from './delete-rfp-dialog';
import { Country, State } from 'country-state-city';
import { ensureDate } from '@/lib/utils';

const getRFPStage = (rfp: RFP): string => {
  if (rfp.status === 'draft') return 'Draft';
  if (rfp.status === 'closed') return 'Closed';

  // For published RFPs, we determine stage based on dates
  const now = new Date();
  const openDate = ensureDate(rfp.openDate);
  const closeDate = ensureDate(rfp.closeDate);

  if (now < openDate) {
    return 'Supplier Selection';
  }
  if (now >= openDate && now <= closeDate) {
    return 'Accepting Proposals';
  }
  if (now > closeDate) {
    return 'Evaluation';
  }
  
  return 'Published';
};

export const columns: ColumnDef<RFP>[] = [
  {
    id: 'actions',
    cell: ({ row }) => {
      const rfp = row.original;

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
                <Link to={`/dashboard/rfps/${rfp.id}`}>View Details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link to={`/dashboard/rfps/${rfp.id}/compare`}>Compare Proposals</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/dashboard/rfps/${rfp.id}/edit`}>Edit RFP</Link>
            </DropdownMenuItem>
            <DeleteRFPDialog rfp={rfp}>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive"
              >
                Delete RFP
              </DropdownMenuItem>
            </DeleteRFPDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => {
        return <Link to={`/dashboard/rfps/${row.original.id}`} className="font-medium text-primary hover:underline">{row.getValue('title')}</Link>
    }
  },
  {
    accessorKey: 'flowType',
    header: 'Flow Type',
    cell: ({ row }) => {
        const flowType = row.getValue('flowType') as string || 'simple';
        return <Badge variant={flowType === 'advanced' ? 'default' : 'secondary'} className="capitalize whitespace-nowrap">{flowType}</Badge>;
    }
  },
  {
    id: 'project',
    header: 'Project',
    cell: ({ row }) => {
      const rfp = row.original as any;
      if (!rfp.projectId) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <Link to={`/dashboard/projects/${rfp.projectId}`} className="text-xs text-primary hover:underline">
          {rfp._projectName || 'View Project'}
        </Link>
      );
    },
  },
  {
    id: 'location',
    header: 'Location',
    cell: ({ row }) => {
      const { countryCode, stateCode, cityName } = row.original;
      if (!countryCode || !cityName) {
        return 'N/A';
      }

      const country = Country.getCountryByCode(countryCode);
      const state = stateCode ? State.getStateByCodeAndCountry(stateCode, countryCode) : null;

      const parts = [cityName, state?.name, country?.name].filter(Boolean);
      return <span>{parts.join(', ')}</span>;
    },
  },
  {
    id: 'stage',
    header: 'Stage',
    cell: ({ row }) => {
      const stage = getRFPStage(row.original);
      let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
      if (stage === 'Accepting Proposals') variant = 'default';
      if (stage === 'Closed') variant = 'destructive';
      if (stage === 'Evaluation') variant = 'outline';
      
      return <Badge variant={variant} className="capitalize whitespace-nowrap">{stage}</Badge>;
    },
  },
  {
    accessorKey: 'closeDate',
    header: 'Closing Date',
    cell: ({ row }) => {
      const date = ensureDate(row.getValue('closeDate'));
      return <span>{format(date, 'MMM d, yyyy')}</span>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
    cell: ({ row }) => {
      const date = ensureDate(row.getValue('createdAt'));
      return <span>{format(date, 'MMM d, yyyy')}</span>;
    },
  },
];
