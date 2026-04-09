import { doc, getDoc, Timestamp } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { RFP } from '@/types';
import { RFPForm } from '@/components/rfps/rfp-form';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function EditRFPPage() {
  const [rfp, setRfp] = useState<RFP | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      setError('No RFP ID provided.');
      setLoading(false);
      return;
    }

    const fetchRfp = async () => {
      try {
        const rfpDocRef = doc(db, 'rfps', id);
        const rfpDoc = await getDoc(rfpDocRef);

        if (!rfpDoc.exists()) {
          navigate('/dashboard', { replace: true });
          return;
        }

        const rfpData = { id: rfpDoc.id, ...rfpDoc.data() } as RFP;
        
        // Firestore Timestamps need to be converted to JS Date for the form
        const editableRfp = {
            ...rfpData,
            openDate: (rfpData.openDate as Timestamp).toDate(),
            closeDate: (rfpData.closeDate as Timestamp).toDate(),
            createdAt: (rfpData.createdAt as Timestamp).toDate(),
        };

        setRfp(editableRfp as RFP);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRfp();
  }, [id]);

  if (loading) {
     return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  if (error) {
     return (
       <div className="flex h-full w-full items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (!rfp) {
    return null; // or a not found component
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit RFP</h1>
        <p className="text-sm text-muted-foreground">
          Modify the details for &quot;{rfp.title}&quot;.
        </p>
      </div>
      <RFPForm rfp={rfp} flowType={rfp.flowType} />
    </div>
  );
}
