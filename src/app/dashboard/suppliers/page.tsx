import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { columns } from '@/components/suppliers/columns';
import { DataTable } from '@/components/suppliers/data-table';
import type { Supplier } from '@/types';
import { collection, onSnapshot, query } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { ImportExportDialog } from '@/components/suppliers/import-export-dialog';

export default function SuppliersPage() {
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'suppliers'));
    const unsubscribe = onSnapshot(q,
      (querySnapshot) => {
        const suppliers = querySnapshot.docs.map((doc) => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...docData,
            createdAt: docData.createdAt?.toDate ? docData.createdAt.toDate() : new Date(docData.createdAt),
          } as Supplier;
        });
        setData(suppliers);
        setLoading(false);
      },
      (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'suppliers',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setError(serverError);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h2 className="text-xl font-semibold text-destructive">
          Permission Denied
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          You do not have permission to view the list of suppliers.
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Error: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Supplier Management</h1>
          <p className="text-sm text-muted-foreground">
            View, add, and manage your company&apos;s suppliers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportDialog currentData={data} />
          <Button asChild>
            <Link to="/dashboard/suppliers/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Supplier
            </Link>
          </Button>
        </div>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
