import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '../ui/textarea';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { errorEmitter } from '@/lib/error-emitter';
import { logAudit } from '@/lib/audit';
import { FirestorePermissionError } from '@/lib/errors';
import type { RfpTemplate } from '@/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { FileUpload } from '@/components/file-upload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters.' }),
  type: z.enum(['email', 'document']),
  category: z.string().min(3, { message: 'Category is required.' }),
  subject: z.string().optional(),
  language: z.string().min(2, { message: 'Language code is required.' }),
  body: z.string().optional(),
  fileUrl: z.string().optional(),
  fileType: z.enum(['docx', 'xlsx']).optional(),
}).refine((data) => {
  if (data.type === 'email') {
    return !!data.subject && data.subject.length >= 5 && !!data.body && data.body.length >= 20;
  }
  if (data.type === 'document') {
    return !!data.fileUrl;
  }
  return true;
}, {
  message: "Subject and Body are required for emails; File is required for documents.",
  path: ["type"],
});

interface TemplateFormProps {
  template?: RfpTemplate;
}

export function TemplateForm({ template }: TemplateFormProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const isEditMode = !!template;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode && template
      ? {
          name: template.name,
          type: template.type || 'email',
          category: template.category,
          subject: template.subject || '',
          language: template.language,
          body: template.body || '',
          fileUrl: template.fileUrl || '',
          fileType: template.fileType as any,
        }
      : {
          name: '',
          type: 'email',
          category: '',
          subject: '',
          language: 'en-US',
          body: '',
          fileUrl: '',
        },
  });

  const templateType = form.watch('type');

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);

    if (isEditMode && template) {
      const templateRef = doc(db, 'emailTemplates', template.id);
      const updatedTemplate = {
        ...values,
        updatedAt: serverTimestamp(),
      };

      updateDoc(templateRef, updatedTemplate as any)
        .then(() => {
          logAudit({ action: 'template.updated', category: 'template', targetCollection: 'emailTemplates', targetDocId: template.id, details: { name: values.name, type: values.type } });
          navigate(`/dashboard/templates`);
        })
        .catch((serverError) => {
          const permissionError = new FirestorePermissionError({
            path: templateRef.path,
            operation: 'update',
            requestResourceData: updatedTemplate,
          });
          errorEmitter.emit('permission-error', permissionError);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      const newTemplate = {
        ...values,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const templatesCollection = collection(db, 'emailTemplates');

      addDoc(templatesCollection, newTemplate)
        .then((docRef) => {
          logAudit({ action: 'template.created', category: 'template', targetCollection: 'emailTemplates', targetDocId: docRef.id, details: { name: values.name, type: values.type } });
          navigate('/dashboard/templates');
        })
        .catch((serverError) => {
          const permissionError = new FirestorePermissionError({
            path: templatesCollection.path,
            operation: 'create',
            requestResourceData: newTemplate,
          });
          errorEmitter.emit('permission-error', permissionError);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., RFP Invitation" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., RFP, Reminder, Award" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Template Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-row space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="email" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Email
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="document" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Document (Word/Excel)
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {templateType === 'email' ? (
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Invitation to Participate in RFP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="fileType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>File Format</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select target format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="docx">Microsoft Word (.docx)</SelectItem>
                          <SelectItem value="xlsx">Microsoft Excel (.xlsx)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fileUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template File</FormLabel>
                      <FormControl>
                        <FileUpload
                          value={field.value ? [{ name: 'Template File', url: field.value }] : []}
                          onChange={(files) => {
                            if (files.length > 0) {
                              field.onChange(files[0].url);
                            } else {
                              field.onChange('');
                            }
                          }}
                          folder="templates"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., en-US" {...field} />
                  </FormControl>
                   <FormDescription className="text-xs">
                        Use language codes like en-US, es-ES, fr-FR.
                    </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {templateType === 'email' && (
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Body</FormLabel>
                    <FormControl>
                      <div className="space-y-4">
                        <Textarea
                          placeholder="Dear Supplier,..."
                          className="min-h-[300px]"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs">
                      You can use placeholders like {'{{contactName}}'} or {'{{rfpTitle}}'}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? 'Save Changes' : 'Create Template'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
