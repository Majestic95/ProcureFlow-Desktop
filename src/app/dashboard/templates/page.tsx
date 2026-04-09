import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { columns } from '@/components/templates/columns';
import { DataTable } from '@/components/templates/data-table';
import type { RfpTemplate } from '@/types';
import { collection, onSnapshot, query } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { useAuth } from '@/hooks/use-auth';
import AccessDenied from '@/components/auth/access-denied';

export default function TemplatesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<RfpTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'emailTemplates'));
    const unsubscribe = onSnapshot(q,
      (querySnapshot) => {
        const templates = querySnapshot.docs.map((doc) => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...docData,
            createdAt: docData.createdAt?.toDate?.() || new Date(),
            updatedAt: docData.updatedAt?.toDate?.() || new Date(),
          } as RfpTemplate;
        });
        setData(templates);
        setLoading(false);
      },
      (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'emailTemplates',
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
          You do not have permission to view the list of templates.
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
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage your email and document templates for the RFP process.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/templates/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Template
          </Link>
        </Button>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
