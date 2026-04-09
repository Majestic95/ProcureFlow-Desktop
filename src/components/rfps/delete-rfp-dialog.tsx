import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { RFP } from '@/types';
import { doc, deleteDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';

interface DeleteRFPDialogProps {
  rfp: RFP;
  children: React.ReactNode;
}

export function DeleteRFPDialog({ rfp, children }: DeleteRFPDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmation !== rfp.title) {
      toast({
        variant: 'destructive',
        title: 'Confirmation failed',
        description: 'The RFP title does not match.',
      });
      return;
    }
    setIsDeleting(true);
    
    const rfpRef = doc(db, 'rfps', rfp.id);
    
    deleteDoc(rfpRef)
        .then(() => {
            logAudit({ action: 'rfp.deleted', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, details: { title: rfp.title } });
            toast({
                title: 'RFP Deleted',
                description: `"${rfp.title}" has been permanently deleted.`,
            });
            setOpen(false);
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: rfpRef.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to delete RFP.',
            });
        })
        .finally(() => {
            setIsDeleting(false);
        });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{children}</div>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the RFP titled{' '}
            <strong className="text-foreground">{rfp.title}</strong> and all associated data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="confirmation">Please type the RFP title to confirm:</Label>
          <Input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={rfp.title}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmation('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            asChild
            disabled={confirmation !== rfp.title || isDeleting}
          >
            <Button
              onClick={handleDelete}
              variant="destructive"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete RFP
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
