import { RFPForm } from '@/components/rfps/rfp-form';
import { useSearchParams } from 'react-router-dom';
import { Suspense } from 'react';

function NewRFPContent() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;
  const clientId = searchParams.get('clientId') || undefined;

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create New RFP</h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details below to create a new Request for Proposal.
        </p>
      </div>
      <RFPForm flowType="simple" defaultProjectId={projectId} defaultClientId={clientId} />
    </div>
  );
}

export default function NewRFPPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><span className="animate-spin">Loading...</span></div>}>
      <NewRFPContent />
    </Suspense>
  );
}
