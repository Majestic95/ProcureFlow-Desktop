import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Button } from '../ui/button';
import { Link } from 'react-router-dom';
import { ensureDate } from '@/lib/utils';
import { Trash2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { deleteDoc, doc } from '@/lib/firestore-compat';
import { db, storage } from '@/lib/firebase';
import { deleteObject, ref } from '@/lib/file-storage';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { EnrichedProposal } from '@/app/dashboard/proposals/page';
import type { Proposal } from '@/types';
import { logAudit } from '@/lib/audit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


interface ProposalsListProps {
  proposals: EnrichedProposal[];
  onProposalDeleted: (proposalId: string) => void;
}

function DeleteProposalDialog({ proposal, onConfirmDelete }: { proposal: Proposal, onConfirmDelete: () => void }) {
    const [open, setOpen] = useState(false);
    const [confirmation, setConfirmation] = useState('');

    useEffect(() => {
      if (!open) setConfirmation('');
    }, [open]);

    const confirmValue = proposal.supplierName || proposal.id;

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-lg font-semibold">Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the proposal from{' '}
                        <strong className="text-foreground">{confirmValue}</strong> and all its associated files from storage.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-4">
                    <Label htmlFor="proposal-delete-confirmation">Please type the supplier name to confirm:</Label>
                    <Input
                        id="proposal-delete-confirmation"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        placeholder={confirmValue}
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmation('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        asChild
                        disabled={confirmation !== confirmValue}
                    >
                        <Button onClick={onConfirmDelete} variant="destructive">
                            Delete Proposal
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function ProposalsList({ proposals, onProposalDeleted }: ProposalsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDeleteProposal = async (proposal: Proposal) => {
    setDeletingId(proposal.id);
    try {
        // 1. Delete associated files from Storage
        if (proposal.attachments && proposal.attachments.length > 0) {
            await Promise.all(
                proposal.attachments.map(file => {
                    if (!file.url) return Promise.resolve();
                    const fileRef = ref(storage, file.url);
                    return deleteObject(fileRef);
                })
            );
        }
        
        // 2. Delete the proposal document from Firestore
        await deleteDoc(doc(db, 'proposals', proposal.id));
        logAudit({ action: 'proposal.deleted', category: 'proposal', targetCollection: 'proposals', targetDocId: proposal.id, details: { rfpId: proposal.rfpId, supplierName: proposal.supplierName || 'unknown' } });

        toast({
            title: 'Success',
            description: 'Proposal has been deleted successfully.',
        });
        
        onProposalDeleted(proposal.id);

    } catch (error) {
        console.error('Error deleting proposal:', error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to delete the proposal. Please try again.',
        });
    } finally {
        setDeletingId(null);
    }
  };

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>RFP Title</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted At</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.length > 0 ? (
            proposals.map((proposal) => (
              <TableRow key={proposal.id}>
                <TableCell>
                  <Link to={`/dashboard/rfps/${proposal.rfpId}`} className="font-medium text-primary hover:underline text-sm">
                    {proposal.rfpTitle}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  {proposal.supplierName}
                  {proposal.revision !== undefined && (
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-none mt-1 block">Revision {proposal.revision}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={proposal.status === 'submitted' ? 'default' : 'secondary'}>
                    {proposal.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {format(ensureDate(proposal.submittedAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(proposal.price)}
                </TableCell>
                 <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                            <Link to={`/dashboard/proposals/${proposal.id}`}>
                                Evaluate
                            </Link>
                        </Button>
                         {deletingId === proposal.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                           <DeleteProposalDialog 
                                proposal={proposal} 
                                onConfirmDelete={() => handleDeleteProposal(proposal)} 
                            />
                        )}
                    </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-sm">
                No proposals found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
