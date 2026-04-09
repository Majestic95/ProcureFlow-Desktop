import { RFPForm } from '@/components/rfps/rfp-form';
import { Badge } from '@/components/ui/badge';
import { Workflow } from 'lucide-react';

export default function NewadvancedRFPPage() {
  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Create New RFP</h1>
          <Badge variant="outline" className="text-pink-700 border-pink-200 bg-pink-50">
            <Workflow className="mr-1 h-3 w-3" />
            advanced Flow
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          This RFP will follow the structured advanced RFP process.
        </p>
      </div>
      <RFPForm flowType="advanced" />
    </div>
  );
}
