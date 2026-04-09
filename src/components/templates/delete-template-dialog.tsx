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
import type { RfpTemplate } from '@/types';
import { doc, deleteDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';

interface DeleteTemplateDialogProps {
  template: RfpTemplate;
  children: React.ReactNode;
}

export function DeleteTemplateDialog({ template, children }: DeleteTemplateDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmation !== template.name) {
      toast({
        variant: 'destructive',
        title: 'Confirmation failed',
        description: 'The template name does not match.',
      });
      return;
    }
    setIsDeleting(true);
    
    const templateRef = doc(db, 'emailTemplates', template.id);
    
    deleteDoc(templateRef)
        .then(() => {
            logAudit({ action: 'template.deleted', category: 'template', targetCollection: 'emailTemplates', targetDocId: template.id, details: { name: template.name } });
            toast({
                title: 'Template Deleted',
                description: `"${template.name}" has been permanently deleted.`,
            });
            setOpen(false);
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: templateRef.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to delete template.',
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
            This action cannot be undone. This will permanently delete the template titled{' '}
            <strong className="text-foreground">{template.name}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="confirmation">Please type the template name to confirm:</Label>
          <Input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={template.name}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmation('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            asChild
            disabled={confirmation !== template.name || isDeleting}
          >
            <Button
              onClick={handleDelete}
              variant="destructive"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Template
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
