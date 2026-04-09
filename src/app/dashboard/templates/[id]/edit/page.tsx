import { doc, getDoc, Timestamp } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { RfpTemplate } from '@/types';
import { TemplateForm } from '@/components/templates/template-form';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function EditTemplatePage() {
  const [template, setTemplate] = useState<RfpTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      setError('No Template ID provided.');
      setLoading(false);
      return;
    }

    const fetchTemplate = async () => {
      try {
        const templateDocRef = doc(db, 'emailTemplates', id);
        const templateDoc = await getDoc(templateDocRef);

        if (!templateDoc.exists()) {
          navigate('/dashboard', { replace: true });
          return;
        }

        const templateData = { id: templateDoc.id, ...templateDoc.data() } as RfpTemplate;
        
        const editableTemplate = {
            ...templateData,
            createdAt: (templateData.createdAt as Timestamp).toDate(),
            updatedAt: (templateData.updatedAt as Timestamp).toDate(),
        };

        setTemplate(editableTemplate as RfpTemplate);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
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

  if (!template) {
    return null; // or a not found component
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Template</h1>
        <p className="text-sm text-muted-foreground">
          Modify the details for &quot;{template.name}&quot;.
        </p>
      </div>
      <TemplateForm template={template} />
    </div>
  );
}
