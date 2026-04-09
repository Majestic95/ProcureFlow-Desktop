import { doc, getDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { RFP } from '@/types';
import { ensureDate } from '@/lib/utils';
import { RfpDetailClient } from '@/components/rfps/rfp-detail-client';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function RFPDetailPage() {
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
        
        // Firestore Timestamps need to be converted to serializable format for client components
        const serializedRfp = {
            ...rfpData,
            openDate: ensureDate(rfpData.openDate).toISOString(),
            closeDate: ensureDate(rfpData.closeDate).toISOString(),
            createdAt: ensureDate(rfpData.createdAt).toISOString(),
            selectedSupplierIds: rfpData.selectedSupplierIds || [],
        } as any;

        setRfp(serializedRfp);
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
    return null;
  }

  return <RfpDetailClient rfp={rfp as any} />;
}
