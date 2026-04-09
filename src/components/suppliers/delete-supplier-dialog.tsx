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
import type { Supplier } from '@/types';
import { doc, deleteDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';

interface DeleteSupplierDialogProps {
  supplier: Supplier;
  children: React.ReactNode;
}

export function DeleteSupplierDialog({ supplier, children }: DeleteSupplierDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmation !== supplier.companyName) {
      toast({
        variant: 'destructive',
        title: 'Confirmation failed',
        description: 'The company name does not match.',
      });
      return;
    }
    setIsDeleting(true);
    
    const supplierRef = doc(db, 'suppliers', supplier.id);
    
    deleteDoc(supplierRef)
        .then(() => {
            logAudit({ action: 'supplier.deleted', category: 'supplier', targetCollection: 'suppliers', targetDocId: supplier.id, details: { companyName: supplier.companyName } });
            toast({
                title: 'Supplier Deleted',
                description: `"${supplier.companyName}" has been permanently deleted.`,
            });
            setOpen(false);
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: supplierRef.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to delete supplier.',
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
          <AlertDialogTitle className="text-lg font-semibold">Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            This action cannot be undone. This will permanently delete the supplier{' '}
            <strong className="text-foreground">{supplier.companyName}</strong> and all associated data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="confirmation">Please type the company name to confirm:</Label>
          <Input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={supplier.companyName}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmation('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            asChild
            disabled={confirmation !== supplier.companyName || isDeleting}
          >
            <Button
              onClick={handleDelete}
              variant="destructive"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Supplier
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
