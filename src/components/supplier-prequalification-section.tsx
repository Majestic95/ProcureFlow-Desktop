import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import type { Prequalification, RFP, Supplier } from '@/types';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from '@/lib/firestore-compat';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { FileUpload } from '@/components/file-upload';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { logAudit } from '@/lib/audit';
import { StageCompletion } from './rfps/rfp-detail-client';

type Section =
  | 'company'
  | 'hse'
  | 'quality'
  | 'financial'
  | 'compliance'
  | 'references'
  | 'evaluation';

const sections: { id: Section; title: string }[] = [
  { id: 'company', title: 'Company Profile' },
  { id: 'hse', title: 'HSE & Safety Performance' },
  { id: 'quality', title: 'Quality & Certifications' },
  { id: 'financial', title: 'Financial & Capacity' },
  { id: 'compliance', title: 'Compliance & Legal' },
  { id: 'references', title: 'References & Past Projects' },
  { id: 'evaluation', title: 'Internal Evaluation & Status' },
];

const defaultPrequalData: Prequalification = {
  id: '',
  supplierId: '',
  legalEntityName: '',
  yearEstablished: new Date().getFullYear(),
  numberOfEmployees: 0,
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  hasHseSystem: false,
  hasSafetyPolicy: false,
  trir: [],
  ltifr: [],
  recordableIncidents: [],
  fatalities: [],
  hsePrograms: '',
  hseDocs: [],
  certifications: [],
  qaQcProcess: '',
  qualityDocs: [],
  annualRevenueRange: '',
  maxContractSize: 0,
  activeProjects: 0,
  geographicCoverage: '',
  hasLitigation: false,
  litigationDetails: '',
  hasSanctions: false,
  sanctionsDetails: '',
  hasEthicsPolicy: false,
  insuranceDocs: [],
  licenseDocs: [],
  references: [],
  hseRiskRating: '',
  financialRiskRating: '',
  overallPerformanceRating: 0,
  internalComments: '',
  status: 'Draft',
  updatedAt: new Date(),
};

const SectionForm = ({
  activeSection,
  control,
  register,
}: {
  activeSection: Section;
  control: any;
  register: any;
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'references',
  });

  switch (activeSection) {
    case 'company':
      return (
        <div className="space-y-4">
          <Controller
            name="legalEntityName"
            control={control}
            render={({ field }) => (
              <FormItem field={field} label="Legal Entity Name" />
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="yearEstablished"
              control={control}
              render={({ field }) => (
                <FormItem
                  field={field}
                  label="Year Established"
                  type="number"
                />
              )}
            />
            <Controller
              name="numberOfEmployees"
              control={control}
              render={({ field }) => (
                <FormItem
                  field={field}
                  label="Number of Employees"
                  type="number"
                />
              )}
            />
          </div>
          <Controller
            name="primaryContactName"
            control={control}
            render={({ field }) => (
              <FormItem field={field} label="Primary Contact Name" />
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="primaryContactEmail"
              control={control}
              render={({ field }) => (
                <FormItem field={field} label="Contact Email" type="email" />
              )}
            />
            <Controller
              name="primaryContactPhone"
              control={control}
              render={({ field }) => (
                <FormItem field={field} label="Contact Phone" type="tel" />
              )}
            />
          </div>
        </div>
      );
    case 'hse':
      return (
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Controller
              name="hasHseSystem"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label>Formal HSE management system in place?</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Controller
              name="hasSafetyPolicy"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label>Written safety policy available?</Label>
          </div>

          <div>
            <Label>Describe your main HSE programs and initiatives.</Label>
            <Controller
              name="hsePrograms"
              control={control}
              render={({ field }) => <Textarea {...field} />}
            />
          </div>
          <div>
            <Label>HSE Policy / Safety Statistics</Label>
            <Controller
              name="hseDocs"
              control={control}
              render={({ field }) => (
                <FileUpload
                  value={field.value}
                  onChange={field.onChange}
                  folder="prequalifications/hse"
                />
              )}
            />
          </div>
        </div>
      );
    case 'quality':
      return (
        <div className="space-y-6">
          <Label>Certifications</Label>
          <div className="space-y-2">
            {[
              'ISO 9001',
              'ISO 14001',
              'ISO 45001 / OHSAS 18001',
            ].map((cert) => (
              <Controller
                key={cert}
                name="certifications"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={field.value?.includes(cert)}
                      onCheckedChange={(checked) => {
                        const currentCerts = field.value || [];
                        return checked
                          ? field.onChange([...currentCerts, cert])
                          : field.onChange(
                              currentCerts.filter((value: string) => value !== cert)
                            );
                      }}
                    />
                    <Label>{cert}</Label>
                  </div>
                )}
              />
            ))}
          </div>
          <div>
            <Label>Describe your QA/QC processes</Label>
            <Controller
              name="qaQcProcess"
              control={control}
              render={({ field }) => <Textarea {...field} />}
            />
          </div>
          <div>
            <Label>Quality Manual / Certifications</Label>
            <Controller
              name="qualityDocs"
              control={control}
              render={({ field }) => (
                <FileUpload
                  value={field.value}
                  onChange={field.onChange}
                  folder="prequalifications/quality"
                />
              )}
            />
          </div>
        </div>
      );
    case 'financial':
      return (
        <div className="space-y-4">
          <div>
              <Label>Annual Revenue Range</Label>
              <Controller
                  name="annualRevenueRange"
                  control={control}
                  render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                              <SelectValue placeholder="Select a range" />
                          </SelectTrigger>
                          <SelectContent>
                              {['< 5M', '5–20M', '20–100M', '> 100M'].map((option) => (
                                  <SelectItem key={option} value={option}>{option}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  )}
              />
          </div>
          <Controller
            name="maxContractSize"
            control={control}
            render={({ field }) => (
              <FormItem
                field={field}
                label="Max Contract Size (USD)"
                type="number"
              />
            )}
          />
          <Controller
            name="activeProjects"
            control={control}
            render={({ field }) => (
              <FormItem
                field={field}
                label="Typical Annual Number of Active Projects"
                type="number"
              />
            )}
          />
          <Controller
            name="geographicCoverage"
            control={control}
            render={({ field }) => (
              <FormItem field={field} label="Geographic Coverage" />
            )}
          />
        </div>
      );
    case 'compliance':
      return (
        <div className="space-y-6">
           <div className="flex items-center space-x-2">
            <Controller
              name="hasLitigation"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label>Any ongoing or recent litigation related to safety, environment or ethics?</Label>
          </div>
          <Controller
            name="litigationDetails"
            control={control}
            render={({ field }) => <Textarea {...field} placeholder="If yes, please provide details." />}
          />
          <div className="flex items-center space-x-2">
            <Controller
              name="hasSanctions"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label>Any sanctions or debarments in the last 5 years?</Label>
          </div>
          <Controller
            name="sanctionsDetails"
            control={control}
            render={({ field }) => <Textarea {...field} placeholder="If yes, please provide details." />}
          />
          <div className="flex items-center space-x-2">
            <Controller
              name="hasEthicsPolicy"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label>Do you have an anti-bribery / ethics policy?</Label>
          </div>
           <div>
            <Label>Insurance Certificate</Label>
             <Controller
              name="insuranceDocs"
              control={control}
              render={({ field }) => (
                <FileUpload
                  value={field.value}
                  onChange={field.onChange}
                  folder="prequalifications/insurance"
                />
              )}
            />
          </div>
           <div>
            <Label>Business Licenses / Registrations</Label>
             <Controller
              name="licenseDocs"
              control={control}
              render={({ field }) => (
                <FileUpload
                  value={field.value}
                  onChange={field.onChange}
                  folder="prequalifications/licenses"
                />
              )}
            />
          </div>
        </div>
      );
    case 'references':
      return (
        <div className="space-y-4">
          {fields.map((item, index) => (
            <Card key={item.id} className="p-4">
              <div className="flex justify-between items-center mb-2">
                 <h4 className="font-semibold">Reference #{index + 1}</h4>
                <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4 text-destructive"/>
                </Button>
              </div>
              <div className="space-y-2">
                <Input placeholder="Client Name" {...register(`references.${index}.clientName`)} />
                <Input placeholder="Project Name" {...register(`references.${index}.projectName`)} />
                <Input placeholder="Location" {...register(`references.${index}.location`)} />
                <Textarea placeholder="Scope / Description" {...register(`references.${index}.scope`)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Contract Value" type="number" {...register(`references.${index}.value`)} />
                  <Input placeholder="Year Completed" type="number" {...register(`references.${index}.year`)} />
                </div>
              </div>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              append({
                clientName: '',
                projectName: '',
                location: '',
                scope: '',
                value: 0,
                year: new Date().getFullYear(),
              })
            }
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add Reference
          </Button>
        </div>
      );
    case 'evaluation':
      return (
        <div className="space-y-4">
           <div>
                <Label>HSE Risk Rating</Label>
                <Controller name="hseRiskRating" control={control} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                        <SelectContent>
                            {['Low', 'Medium', 'High'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )} />
            </div>
            <div>
                <Label>Financial Risk Rating</Label>
                <Controller name="financialRiskRating" control={control} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                        <SelectContent>
                            {['Low', 'Medium', 'High'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )} />
            </div>
            <div>
                <Label>Overall Performance Rating (1-5)</Label>
                <Controller name="overallPerformanceRating" control={control} render={({ field }) => (
                     <Select onValueChange={field.onChange} value={field.value?.toString()}>
                        <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                        <SelectContent>
                            {['1', '2', '3', '4', '5'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )} />
            </div>
            <div>
                <Label>Prequalification Status</Label>
                <Controller name="status" control={control} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                            {['Draft', 'Under review', 'Approved', 'Rejected'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )} />
            </div>
          <div>
            <Label>Internal Comments / Risk Notes</Label>
            <Controller name="internalComments" control={control} render={({ field }) => <Textarea {...field} />} />
          </div>
        </div>
      );
    default:
      return null;
  }
};

const FormItem = ({ field, label, type = 'text' }: any) => (
  <div>
    <Label>{label}</Label>
    <Input type={type} {...field} />
  </div>
);

interface SupplierPrequalificationSectionProps {
    rfp?: any;
    stageKey?: string;
    onStageUpdate?: (stages: string[], isCompleting: boolean) => void;
}


export function SupplierPrequalificationSection({ rfp, stageKey, onStageUpdate }: SupplierPrequalificationSectionProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] =
    useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('company');
  const { toast } = useToast();

  const { control, register, handleSubmit, reset } = useForm<Prequalification>({
    defaultValues: defaultPrequalData,
  });

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'suppliers'));
        const suppliersData = querySnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Supplier)
        );
        setSuppliers(suppliersData);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSuppliers();
  }, []);

  const handleSupplierChange = async (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId) || null;
    setSelectedSupplier(supplier);

    if (supplier) {
      setLoading(true);
      try {
        const prequalDocRef = doc(
          db,
          'suppliers',
          supplier.id,
          'prequalifications',
          supplier.id
        );
        const prequalDoc = await getDoc(prequalDocRef);
        if (prequalDoc.exists()) {
          reset(prequalDoc.data() as Prequalification);
        } else {
          reset({
              ...defaultPrequalData,
              supplierId: supplier.id,
              primaryContactName: (Array.isArray(supplier.contacts) && supplier.contacts[0]?.name) || '',
              primaryContactEmail: (Array.isArray(supplier.contacts) && supplier.contacts[0]?.email) || '',
              primaryContactPhone: (Array.isArray(supplier.contacts) && supplier.contacts[0]?.phone) || '',
          });
        }
      } catch (error) {
        console.error('Error fetching prequalification data:', error);
        reset(defaultPrequalData);
      } finally {
        setLoading(false);
      }
    } else {
      reset(defaultPrequalData);
    }
  };

  const onSubmit = async (data: Prequalification) => {
    if (!selectedSupplier) {
      toast({
        variant: 'destructive',
        title: 'No Supplier Selected',
        description: 'Please select a supplier before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      const prequalDocRef = doc(
        db,
        'suppliers',
        selectedSupplier.id,
        'prequalifications',
        selectedSupplier.id
      );
      await setDoc(prequalDocRef, {
        ...data,
        supplierId: selectedSupplier.id,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      logAudit({ action: 'supplier.prequalification_updated', category: 'supplier', targetCollection: 'suppliers', targetDocId: selectedSupplier.id, details: { section: activeSection } });
      toast({
        title: 'Success',
        description: 'Prequalification data saved.',
      });
    } catch (error) {
      console.error('Error saving prequalification:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save data.',
      });
    } finally {
      setSaving(false);
    }
  };

  const supplierOptions = suppliers.map(s => ({label: s.companyName, value: s.id}));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div className="w-full max-w-xs">
                <SearchableSelect
                    label="Supplier"
                    placeholder="Select a supplier"
                    options={supplierOptions}
                    value={selectedSupplier?.id}
                    onChange={handleSupplierChange}
                    disabled={loading}
                />
            </div>
            <Button asChild>
                <Link to="/dashboard/suppliers/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add new supplier
                </Link>
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
            <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )}

        {!loading && selectedSupplier && (
            <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mt-4 grid gap-6 md:grid-cols-[260px,1fr]">
            <nav className="flex flex-col gap-1">
                {sections.map((section) => (
                <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                    'text-left rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    activeSection === section.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    )}
                >
                    {section.title}
                </button>
                ))}
            </nav>

            <Card>
                <CardHeader>
                <CardTitle className="text-lg font-semibold">
                    {sections.find((s) => s.id === activeSection)?.title}
                </CardTitle>
                </CardHeader>
                <CardContent>
                <SectionForm
                    activeSection={activeSection}
                    control={control}
                    register={register}
                />
                </CardContent>
            </Card>
            </div>
             <div className="mt-6 flex justify-end">
                <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Prequalification
                </Button>
            </div>
          </form>
        )}
        {!loading && !selectedSupplier && (
            <div className="text-center text-muted-foreground py-8">
                <p>Please select a supplier to view or edit their prequalification data.</p>
            </div>
        )}
      </CardContent>
      {rfp && stageKey && onStageUpdate && (
          <StageCompletion stage={stageKey} rfp={rfp} onUpdate={onStageUpdate} />
      )}
    </Card>
  );
}
