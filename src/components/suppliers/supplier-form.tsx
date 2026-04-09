import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState } from 'react';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '../ui/textarea';
import { FileUpload } from '../file-upload';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "@/lib/firestore-compat"; 
import { db } from "@/lib/firebase";
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import type { Supplier } from '@/types';
import { MultiSelect } from '../ui/multi-select';
import { CONSTRUCTION_TRADES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { SupplierCoverage } from './supplier-coverage';

const contactSchema = z.object({
    name: z.string().min(2, { message: 'Name is required.' }),
    role: z.string().min(2, { message: 'Role is required.' }),
    email: z.string().email({ message: 'Invalid email.' }),
    phone: z.string().min(10, { message: 'Invalid phone.' }),
});

const estimatedRevenueSchema = z.object({
    year: z.coerce.number().min(1900, 'Invalid year.'),
    amountUsd: z.coerce.number().min(0, 'Amount must be positive.'),
});

const estimatedPersonnelSchema = z.object({
    year: z.coerce.number().min(1900, 'Invalid year.'),
    headcount: z.coerce.number().int().min(0, 'Headcount must be positive.'),
});


const formSchema = z.object({
  companyName: z.string().min(2, { message: 'Company name is required.' }),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  contacts: z.array(contactSchema).min(1, 'At least one contact is required.'),
  address: z.string().min(5, { message: 'Address is required.' }),
  categories: z.array(z.string()).min(1, { message: 'At least one category is required.' }),
  documents: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  estimatedRevenue: z.array(estimatedRevenueSchema).optional(),
  estimatedPersonnel: z.array(estimatedPersonnelSchema).optional(),
});

interface SupplierFormProps {
    supplier?: Supplier;
}

const tradeOptions = [
    ...CONSTRUCTION_TRADES.map(trade => ({ label: trade, value: trade })),
    // We add extra categories here if needed, but we'll also handle them in the component state
];

export function SupplierForm({ supplier }: SupplierFormProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [newCatInput, setNewCatInput] = useState('');
  const isEditMode = !!supplier;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        ...supplier,
        websiteUrl: supplier.websiteUrl || '',
        logoUrl: supplier.logoUrl || '',
        contacts: supplier.contacts || [{ name: '', role: '', email: '', phone: '' }],
        estimatedRevenue: supplier.estimatedRevenue || [],
        estimatedPersonnel: supplier.estimatedPersonnel || [],
    } : {
      companyName: '',
      websiteUrl: '',
      logoUrl: '',
      contacts: [{ name: '', role: '', email: '', phone: '' }],
      address: '',
      categories: [],
      documents: [],
      estimatedRevenue: [],
      estimatedPersonnel: [],
    },
  });
  
  const logoUrl = form.watch("logoUrl");
  const supplierName = form.watch("companyName");

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "contacts",
  });
  
  const { fields: revenueFields, append: appendRevenue, remove: removeRevenue } = useFieldArray({
    control: form.control,
    name: "estimatedRevenue",
  });
  
  const { fields: personnelFields, append: appendPersonnel, remove: removePersonnel } = useFieldArray({
    control: form.control,
    name: "estimatedPersonnel",
  });


  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    
    const processedValues = {
        ...values,
        websiteUrl: values.websiteUrl || null,
        logoUrl: values.logoUrl || null,
        estimatedPersonnel: values.estimatedPersonnel || [],
    };

    if (isEditMode && supplier) {
        const supplierRef = doc(db, 'suppliers', supplier.id);
        updateDoc(supplierRef, processedValues as any)
            .then(() => {
                logAudit({ action: 'supplier.updated', category: 'supplier', targetCollection: 'suppliers', targetDocId: supplier.id, details: { companyName: values.companyName } });
                navigate(`/dashboard/suppliers/${supplier.id}`);
            })
            .catch((serverError) => {
                const permissionError = new FirestorePermissionError({
                  path: supplierRef.path,
                  operation: 'update',
                  requestResourceData: processedValues,
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                setIsLoading(false);
            });

    } else {
        const newSupplier = {
          ...processedValues,
          rating: 0,
          createdAt: serverTimestamp(),
        };
        
        const suppliersCollection = collection(db, "suppliers");
        
        addDoc(suppliersCollection, newSupplier)
          .then((docRef) => {
            logAudit({ action: 'supplier.created', category: 'supplier', targetCollection: 'suppliers', targetDocId: docRef.id, details: { companyName: values.companyName } });
            navigate('/dashboard/suppliers');
          })
          .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
              path: suppliersCollection.path,
              operation: 'create',
              requestResourceData: newSupplier,
            });
            errorEmitter.emit('permission-error', permissionError);
          })
          .finally(() => {
            setIsLoading(false);
          });
    }
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{isEditMode ? 'Edit Supplier' : 'Register New Supplier'}</h1>
              <p className="text-sm text-muted-foreground">
                {isEditMode
                  ? `Modify the details for "${supplierName || supplier?.companyName}".`
                  : 'Fill in the details below to add a new supplier to the system.'}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {isEditMode && logoUrl && (
                <div className="h-16 w-32 border rounded-md bg-white flex items-center justify-center shadow-sm p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt={(supplierName || supplier?.companyName || "Supplier") + " logo"}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode ? 'Save Changes' : 'Register Supplier'}
                </Button>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Basic Information</CardTitle>
              <CardDescription className="text-xs">Enter the supplier&apos;s main details and contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Innovate Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="websiteUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://www.company-website.com"
                            type="url"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/path/to/logo.png"
                            type="url"
                            {...field}
                          />
                        </FormControl>
                         <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>
              
              <div>
                <FormLabel>Contacts</FormLabel>
                <div className="border rounded-md mt-2">
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {fields.map((field, index) => (
                              <TableRow key={field.id} className="align-top">
                                  <TableCell className="py-2">
                                      <FormField
                                          control={form.control}
                                          name={`contacts.${index}.name`}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Input {...field} placeholder="John Doe" />
                                              </FormControl>
                                              <FormMessage className="text-xs"/>
                                            </FormItem>
                                          )}
                                      />
                                  </TableCell>
                                  <TableCell className="py-2">
                                      <FormField
                                          control={form.control}
                                          name={`contacts.${index}.role`}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Input {...field} placeholder="Project Manager" />
                                              </FormControl>
                                              <FormMessage className="text-xs"/>
                                            </FormItem>
                                          )}
                                      />
                                  </TableCell>
                                  <TableCell className="py-2">
                                      <FormField
                                          control={form.control}
                                          name={`contacts.${index}.email`}
                                          render={({ field }) => (
                                             <FormItem>
                                              <FormControl>
                                                <Input {...field} type="email" placeholder="john.doe@example.com" />
                                              </FormControl>
                                              <FormMessage className="text-xs"/>
                                            </FormItem>
                                          )}
                                      />
                                  </TableCell>
                                  <TableCell className="py-2">
                                      <FormField
                                          control={form.control}
                                          name={`contacts.${index}.phone`}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Input {...field} type="tel" placeholder="123-456-7890" />
                                              </FormControl>
                                              <FormMessage className="text-xs"/>
                                            </FormItem>
                                          )}
                                      />
                                  </TableCell>
                                  <TableCell className="py-2">
                                      {fields.length > 1 && (
                                          <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                              <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                      )}
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
                </div>
                 <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => append({ name: '', role: '', email: '', phone: '' })}
                >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Contact
                </Button>
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Innovation Drive, Tech City" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
               <FormField
                control={form.control}
                name="categories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categories</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={[...tradeOptions, ...extraCategories.map(c => ({ label: c, value: c }))]}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder="Select trades..."
                        className="w-full"
                      />
                    </FormControl>
                    <div className="flex gap-2 mt-2">
                        <Input 
                          placeholder="Add custom category..." 
                          value={newCatInput}
                          onChange={(e) => setNewCatInput(e.target.value)}
                          className="h-8 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newCatInput.trim()) {
                                const cat = newCatInput.trim();
                                if (!extraCategories.includes(cat) && !CONSTRUCTION_TRADES.includes(cat)) {
                                  setExtraCategories([...extraCategories, cat]);
                                }
                                if (!field.value.includes(cat)) {
                                  field.onChange([...field.value, cat]);
                                }
                                setNewCatInput('');
                              }
                            }
                          }}
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="h-8 py-0"
                          onClick={() => {
                            if (newCatInput.trim()) {
                              const cat = newCatInput.trim();
                              if (!extraCategories.includes(cat) && !CONSTRUCTION_TRADES.includes(cat)) {
                                setExtraCategories([...extraCategories, cat]);
                              }
                              if (!field.value.includes(cat)) {
                                field.onChange([...field.value, cat]);
                              }
                              setNewCatInput('');
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <div className="space-y-2">
              <FormField
                control={form.control}
                name="documents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Documents</FormLabel>
                    <FormControl>
                      <FileUpload
                        value={field.value || []}
                        onChange={field.onChange}
                        folder={`suppliers/${supplier?.id ?? 'new'}/documents`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
             </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">Estimated Revenue</CardTitle>
                    <CardDescription className="text-xs">Add estimated yearly revenue for this supplier.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Year</TableHead>
                                <TableHead>Estimated Revenue (USD)</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {revenueFields.map((field, index) => (
                                <TableRow key={field.id} className="align-top">
                                    <TableCell className="py-2">
                                        <FormField
                                            control={form.control}
                                            name={`estimatedRevenue.${index}.year`}
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormControl>
                                                  <Input type="number" placeholder="e.g., 2025" {...field} />
                                                </FormControl>
                                                <FormMessage className="text-xs" />
                                              </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <FormField
                                            control={form.control}
                                            name={`estimatedRevenue.${index}.amountUsd`}
                                            render={({ field }) => (
                                               <FormItem>
                                                <FormControl>
                                                  <Input type="number" placeholder="e.g., 1500000" {...field} />
                                                </FormControl>
                                                <FormMessage className="text-xs" />
                                              </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Button variant="ghost" size="icon" onClick={() => removeRevenue(index)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => appendRevenue({ year: new Date().getFullYear() + 1, amountUsd: 0 })}
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Year
                    </Button>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">Estimated Personnel</CardTitle>
                    <CardDescription className="text-xs">Add estimated yearly headcount for this supplier.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Year</TableHead>
                                <TableHead>Number of Employees</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {personnelFields.map((field, index) => (
                                <TableRow key={field.id} className="align-top">
                                    <TableCell className="py-2">
                                        <FormField
                                            control={form.control}
                                            name={`estimatedPersonnel.${index}.year`}
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormControl>
                                                  <Input type="number" placeholder="e.g., 2025" {...field} />
                                                </FormControl>
                                                <FormMessage className="text-xs" />
                                              </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <FormField
                                            control={form.control}
                                            name={`estimatedPersonnel.${index}.headcount`}
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormControl>
                                                  <Input type="number" placeholder="e.g., 50" {...field} />
                                                </FormControl>
                                                <FormMessage className="text-xs" />
                                              </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Button variant="ghost" size="icon" onClick={() => removePersonnel(index)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => appendPersonnel({ year: new Date().getFullYear() + 1, headcount: 0 })}
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Year
                    </Button>
                </CardContent>
            </Card>
          </div>

          {isEditMode && supplier && (
              <SupplierCoverage supplierId={supplier.id} />
          )}

        </form>
      </Form>
    </>
  );
}
