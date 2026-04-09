import { SupplierDetailClient } from '@/components/suppliers/supplier-detail-client';
import { useParams } from 'react-router-dom';

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
       <div className="flex h-full w-full items-center justify-center">
        <p>No Supplier ID provided.</p>
      </div>
    )
  }

  return <SupplierDetailClient supplierId={id} />;
}
