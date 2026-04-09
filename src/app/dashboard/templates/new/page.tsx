
import { TemplateForm } from '@/components/templates/template-form';

export default function NewTemplatePage() {
  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create New Template</h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details below to create a new email template.
        </p>
      </div>
      <TemplateForm />
    </div>
  );
}
