import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileUpload } from '../file-upload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { RFP, Supplier } from '@/types';
import { collection, addDoc, serverTimestamp } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { ensureDate } from '@/lib/utils';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';

const formSchema = z.object({
  rfpId: z.string({ required_error: 'Please select an RFP.' }),
  supplierId: z.string({ required_error: 'Please select a supplier.' }),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).min(1, { message: 'At least one document is required.' }),
});

interface ProposalFormProps {
    rfps: RFP[],
    suppliers: Supplier[],
    onSupplierChange?: (supplierId: string | null) => void;
}

const getRFPStage = (rfp: RFP): string => {
    if (rfp.status === 'draft') return 'Draft';
    if (rfp.status === 'closed') return 'Closed';
  
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

export function ProposalForm({ rfps, suppliers, onSupplierChange }: ProposalFormProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      attachments: [],
      rfpId: searchParams.get('rfpId') || '',
      supplierId: searchParams.get('supplierId') || '',
    },
  });

  const selectedSupplierId = form.watch('supplierId');

  useEffect(() => {
    if (onSupplierChange) {
      onSupplierChange(selectedSupplierId);
    }
  }, [selectedSupplierId, onSupplierChange]);

  useEffect(() => {
    const rfpId = searchParams.get('rfpId');
    const supplierId = searchParams.get('supplierId');
    if (rfpId) {
        form.setValue('rfpId', rfpId);
    }
    if (supplierId) {
        form.setValue('supplierId', supplierId);
    }
  }, [searchParams, form]);


  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    const selectedRfp = rfps.find(r => r.id === values.rfpId);
    const newProposal = {
      ...values,
      ...(selectedRfp?.clientId ? { clientId: selectedRfp.clientId } : {}),
      price: 0,
      submittedAt: serverTimestamp(),
      status: 'submitted',
      technicalScore: 0,
      commercialScore: 0,
      finalScore: 0,
      evaluatorComments: '',
      aiSummary: '',
    };
    
    const proposalsCollection = collection(db, 'proposals');

    addDoc(proposalsCollection, newProposal)
      .then((docRef) => {
        logAudit({ action: 'proposal.created', category: 'proposal', targetCollection: 'proposals', targetDocId: docRef.id, details: { rfpId: values.rfpId, supplierName: values.supplierId || 'unknown' } });
        navigate(`/dashboard/rfps/${values.rfpId}`);
      })
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
          path: proposalsCollection.path,
          operation: 'create',
          requestResourceData: newProposal,
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="rfpId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select RFP</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!!searchParams.get('rfpId')}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an RFP to respond to" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rfps.filter(rfp => getRFPStage(rfp) === 'Accepting Proposals').map(rfp => (
                          <SelectItem key={rfp.id} value={rfp.id}>{rfp.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Supplier</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!!searchParams.get('supplierId')}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select the submitting supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.map(supplier => (
                          <SelectItem key={supplier.id} value={supplier.id}>{supplier.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
              control={form.control}
              name="attachments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proposal Documents</FormLabel>
                  <FormDescription>Upload all required proposal documents.</FormDescription>
                  <FormControl>
                    <FileUpload
                      value={field.value}
                      onChange={field.onChange}
                      folder="proposal_attachments"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Proposal
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
