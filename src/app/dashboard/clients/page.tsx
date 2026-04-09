import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { columns } from '@/components/clients/columns';
import { DataTable } from '@/components/clients/data-table';
import type { Client } from '@/types';
import { collection, onSnapshot, query, orderBy } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { useAuth } from '@/hooks/use-auth';
import AccessDenied from '@/components/auth/access-denied';

export default function ClientsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q,
      (querySnapshot) => {
        const clients = querySnapshot.docs.map((doc) => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...docData,
            createdAt: docData.createdAt?.toDate() || new Date(),
          } as Client;
        });
        setData(clients);
        setLoading(false);
      },
      (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'clients',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setError(serverError);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <AccessDenied inline />;
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h2 className="text-xl font-semibold text-destructive">
          Permission Denied
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          You do not have permission to view the list of clients.
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
          <h1 className="text-2xl font-semibold tracking-tight">Client Management</h1>
          <p className="text-sm text-muted-foreground">
            View, add, and manage your clients for the RFP process.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/clients/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Client
          </Link>
        </Button>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
