import { doc, getDoc, Timestamp } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { Supplier } from '@/types';
import { SupplierForm } from '@/components/suppliers/supplier-form';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function EditSupplierPage() {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      setError('No Supplier ID provided.');
      setLoading(false);
      return;
    }

    const fetchSupplier = async () => {
      try {
        const supplierDocRef = doc(db, 'suppliers', id);
        const supplierDoc = await getDoc(supplierDocRef);

        if (!supplierDoc.exists()) {
          navigate('/dashboard', { replace: true });
          return;
        }

        const supplierData = { id: supplierDoc.id, ...supplierDoc.data() } as Supplier;
        
        const editableSupplier = {
            ...supplierData,
            createdAt: (supplierData.createdAt as Timestamp).toDate(),
        };

        setSupplier(editableSupplier as Supplier);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSupplier();
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

  if (!supplier) {
    return null; // or a not found component
  }

  return (
    <div className="container mx-auto py-4 space-y-6">
      <SupplierForm supplier={supplier} />
    </div>
  );
}
