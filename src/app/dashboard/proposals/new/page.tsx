import { ProposalForm } from '@/components/proposals/proposal-form';
import type { RFP, Supplier } from '@/types';
import { useCollection } from '@/lib/firebase-hooks-compat';
import { collection } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

export default function NewProposalPage() {
  const [rfpsValue, rfpsLoading, rfpsError] = useCollection(
    collection(db, 'rfps')
  );
  const [suppliersValue, suppliersLoading, suppliersError] = useCollection(
    collection(db, 'suppliers')
  );

  const loading = rfpsLoading || suppliersLoading;
  const error = rfpsError || suppliersError;

  const rfps =
    rfpsValue?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RFP)) || [];
  const suppliers =
    suppliersValue?.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Supplier)
    ) || [];

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500">
        <p>Error loading data.</p>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2 space-y-6">
      <div>
        <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
            Submit New Proposal
            </h1>
            <p className="text-sm text-muted-foreground">
            Fill in the details below to submit a proposal on behalf of a
            supplier.
            </p>
        </div>
        <ProposalForm rfps={rfps} suppliers={suppliers} />
      </div>
    </div>
  );
}
