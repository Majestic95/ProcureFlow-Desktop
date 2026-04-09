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
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '../ui/textarea';
import { FileUpload } from '../file-upload';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn, ensureDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '../ui/calendar';
import { useAuth } from '@/hooks/use-auth';
import { collection, addDoc, serverTimestamp, Timestamp, updateDoc, doc, getDocs, query, orderBy, where } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { errorEmitter } from '@/lib/error-emitter';
import { logAudit } from '@/lib/audit';
import { FirestorePermissionError } from '@/lib/errors';
import type { RFP, RfpFlowType } from '@/types';
import { Country, State, City } from 'country-state-city';
import { SearchableSelect } from '../ui/searchable-select';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

const formSchema = z.object({
  title: z.string().min(5, { message: 'Title must be at least 5 characters.' }),
  description: z.string().min(20, { message: 'Description must be at least 20 characters.' }),
  countryCode: z.string().min(1, { message: 'Please select a country.' }),
  stateCode: z.string().optional(),
  cityName: z.string().min(1, { message: 'Please select a city.' }),
  clientId: z.string().min(1, { message: 'Please select a client.' }),
  isConfidential: z.boolean().default(false),
  openDate: z.date({ required_error: 'An opening date is required.' }),
  closeDate: z.date({ required_error: 'A closing date is required.' }),
  executionStartDate: z.date().optional(),
  executionEndDate: z.date().optional(),
  eoiDeadline: z.date().optional(),
  procurementContactName: z.string().optional(),
  procurementContactEmail: z.string().optional(),
  procurementContactRole: z.string().optional(),
  procurementContactPhone: z.string().optional(),
  budget: z.coerce.number().min(0, { message: 'Budget must be a positive number.' }),
  attachedFiles: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  projectId: z.string().optional(),
  packageIds: z.array(z.string()).optional(),
});

interface RFPFormProps {
  rfp?: RFP;
  flowType: RfpFlowType;
  defaultProjectId?: string;
  defaultClientId?: string;
}

export function RFPForm({ rfp, flowType, defaultProjectId, defaultClientId }: RFPFormProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [clients, setClients] = useState<{ label: string; value: string }[]>([]);
  const [projects, setProjects] = useState<{ label: string; value: string }[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const isEditMode = !!rfp;

  useEffect(() => {
    let cancelled = false;
    const fetchClients = async () => {
      try {
        const q = query(collection(db, 'clients'), orderBy('name', 'asc'));
        const qs = await getDocs(q);
        if (!cancelled) setClients(qs.docs.map(doc => ({ label: doc.data().name, value: doc.id })));
      } catch (e) {
        // silently ignore — UI will show empty client list
      }
    };
    fetchClients();
    return () => { cancelled = true; };
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        title: rfp.title,
        description: rfp.description,
        countryCode: rfp.countryCode,
        stateCode: rfp.stateCode,
        cityName: rfp.cityName,
        clientId: rfp.clientId || '',
        isConfidential: rfp.isConfidential || false,
        openDate: ensureDate(rfp.openDate),
        closeDate: ensureDate(rfp.closeDate),
        executionStartDate: rfp.executionStartDate ? ensureDate(rfp.executionStartDate) : undefined,
        executionEndDate: rfp.executionEndDate ? ensureDate(rfp.executionEndDate) : undefined,
        eoiDeadline: rfp.eoiDeadline ? ensureDate(rfp.eoiDeadline) : undefined,
        procurementContactName: rfp.procurementContact?.name || '',
        procurementContactEmail: rfp.procurementContact?.email || '',
        procurementContactRole: rfp.procurementContact?.role || '',
        procurementContactPhone: rfp.procurementContact?.phone || '',
        budget: rfp.budget || 0,
        attachedFiles: rfp.attachedFiles,
        projectId: rfp.projectId || '',
        packageIds: rfp.packageIds || [],
    } : {
      title: '',
      description: '',
      countryCode: '',
      stateCode: '',
      cityName: '',
      clientId: '',
      isConfidential: false,
      budget: 0,
      attachedFiles: [],
      procurementContactName: '',
      procurementContactEmail: '',
      procurementContactRole: '',
      procurementContactPhone: '',
      projectId: '',
      packageIds: [],
    },
  });

  const watchedCountryCode = form.watch('countryCode');
  const watchedStateCode = form.watch('stateCode');
  const watchedClientId = form.watch('clientId');
  const watchedProjectId = form.watch('projectId');

  const countries = useMemo(() => Country.getAllCountries().map(c => ({ label: c.name, value: c.isoCode })), []);
  const states = useMemo(() => {
    if (!watchedCountryCode) return [];
    const countryStates = State.getStatesOfCountry(watchedCountryCode);
    if (!countryStates || countryStates.length === 0) return [];
    return countryStates.map(s => ({ label: s.name, value: s.isoCode }));
  }, [watchedCountryCode]);

  const cities = useMemo(() => {
    if (!watchedCountryCode || !watchedStateCode) return [];
    const stateCities = City.getCitiesOfState(watchedCountryCode, watchedStateCode);
    if (!stateCities || stateCities.length === 0) return [];
    return stateCities.map(c => ({ label: c.name, value: c.name }));
  }, [watchedCountryCode, watchedStateCode]);
  
  useEffect(() => {
    if (isEditMode) return;
    form.setValue('stateCode', '');
    form.setValue('cityName', '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCountryCode, isEditMode]);

  useEffect(() => {
    if (isEditMode) return;
    form.setValue('cityName', '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedStateCode, isEditMode]);

  // Fetch projects when clientId changes
  useEffect(() => {
    if (!watchedClientId) {
      setProjects([]);
      setPackages([]);
      return;
    }
    let cancelled = false;
    const fetchProjects = async () => {
      setLoadingProjects(true);
      try {
        const q = query(
          collection(db, 'projects'),
          where('clientId', '==', watchedClientId),
          orderBy('name', 'asc')
        );
        const qs = await getDocs(q);
        if (!cancelled) {
          setProjects(qs.docs.map(d => ({ label: d.data().name, value: d.id })));
        }
      } catch (e) {
        // silently ignore — UI will show empty project list
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    };
    fetchProjects();
    return () => { cancelled = true; };
  }, [watchedClientId]);

  // Reset project/packages when clientId changes (not in edit mode on first render)
  const clientIdRef = useRef(watchedClientId);
  useEffect(() => {
    if (clientIdRef.current !== watchedClientId) {
      form.setValue('projectId', '');
      form.setValue('packageIds', []);
      setPackages([]);
    }
    clientIdRef.current = watchedClientId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedClientId]);

  // Pre-fill from URL params (Create RFP from project)
  useEffect(() => {
    if (isEditMode) return;
    if (defaultClientId) {
      form.setValue('clientId', defaultClientId);
    }
    if (defaultProjectId) {
      form.setValue('projectId', defaultProjectId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultClientId, defaultProjectId, isEditMode]);

  // Fetch packages when projectId changes
  useEffect(() => {
    if (!watchedProjectId) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    const fetchPackages = async () => {
      setLoadingPackages(true);
      try {
        const q = query(
          collection(db, 'projects', watchedProjectId, 'packages'),
          orderBy('name', 'asc')
        );
        const qs = await getDocs(q);
        if (!cancelled) {
          setPackages(qs.docs.map(d => ({ id: d.id, name: d.data().name })));
        }
      } catch (e) {
        // silently ignore — UI will show empty package list
      } finally {
        if (!cancelled) setLoadingPackages(false);
      }
    };
    fetchPackages();
    return () => { cancelled = true; };
  }, [watchedProjectId]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!user) {
        setIsLoading(false);
        return;
    }
    
    if (isEditMode) {
      const rfpRef = doc(db, 'rfps', rfp.id);
      const updatedRFP = {
        ...values,
        stateCode: values.stateCode || '',
        openDate: Timestamp.fromDate(values.openDate),
        closeDate: Timestamp.fromDate(values.closeDate),
        executionStartDate: values.executionStartDate ? Timestamp.fromDate(values.executionStartDate) : null,
        executionEndDate: values.executionEndDate ? Timestamp.fromDate(values.executionEndDate) : null,
        eoiDeadline: values.eoiDeadline ? Timestamp.fromDate(values.eoiDeadline) : null,
        procurementContact: {
          name: values.procurementContactName || '',
          email: values.procurementContactEmail || '',
          role: values.procurementContactRole || '',
          phone: values.procurementContactPhone || '',
        },
        projectId: values.projectId || null,
        packageIds: values.packageIds && values.packageIds.length > 0 ? values.packageIds : [],
        updatedAt: serverTimestamp(),
      };

      updateDoc(rfpRef, updatedRFP)
        .then(() => {
            logAudit({ action: 'rfp.updated', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, clientId: values.clientId, details: { title: values.title } });
            navigate(`/dashboard/rfps/${rfp.id}`);
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
              path: rfpRef.path,
              operation: 'update',
              requestResourceData: updatedRFP,
            });
            errorEmitter.emit('permission-error', permissionError);
        })
        .finally(() => {
            setIsLoading(false);
        });

    } else {
        const newRFP = {
          ...values,
          stateCode: values.stateCode || '',
          openDate: Timestamp.fromDate(values.openDate),
          closeDate: Timestamp.fromDate(values.closeDate),
          executionStartDate: values.executionStartDate ? Timestamp.fromDate(values.executionStartDate) : null,
          executionEndDate: values.executionEndDate ? Timestamp.fromDate(values.executionEndDate) : null,
          eoiDeadline: values.eoiDeadline ? Timestamp.fromDate(values.eoiDeadline) : null,
          procurementContact: {
            name: values.procurementContactName || '',
            email: values.procurementContactEmail || '',
            role: values.procurementContactRole || '',
            phone: values.procurementContactPhone || '',
          },
          projectId: values.projectId || null,
          packageIds: values.packageIds && values.packageIds.length > 0 ? values.packageIds : [],
          status: 'draft',
          flowType: flowType,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        const rfpsCollection = collection(db, "rfps");

        addDoc(rfpsCollection, newRFP)
          .then((docRef) => {
            logAudit({ action: 'rfp.created', category: 'rfp', targetCollection: 'rfps', targetDocId: docRef.id, clientId: values.clientId, details: { title: values.title, flowType } });
            navigate(`/dashboard/rfps/${docRef.id}`);
          })
          .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
              path: rfpsCollection.path,
              operation: 'create',
              requestResourceData: newRFP,
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
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RFP Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., New Corporate Website Design" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide a detailed description of the project, scope, and requirements."
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <SearchableSelect
                      label="Client"
                      placeholder="Select which client we are working for"
                      options={clients}
                      value={field.value}
                      onChange={field.onChange}
                    />
                    <FormDescription>This RFP will be associated with this client.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isConfidential"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Confidential Customer</FormLabel>
                      <FormDescription>
                        If enabled, the client name will be hidden in outgoing invitation emails.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Project & Package Linkage (optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <SearchableSelect
                      label="Project (optional)"
                      placeholder={
                        !watchedClientId
                          ? 'Select a client first'
                          : loadingProjects
                          ? 'Loading projects...'
                          : 'No project (standalone RFP)'
                      }
                      options={[
                        { label: 'No project (standalone RFP)', value: '' },
                        ...projects,
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!watchedClientId || loadingProjects}
                    />
                    <FormDescription>
                      Optionally link this RFP to an existing project.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchedProjectId && (
                <FormField
                  control={form.control}
                  name="packageIds"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Equipment Packages</Label>
                      {loadingPackages ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading packages...
                        </div>
                      ) : packages.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No packages found for this project.
                        </p>
                      ) : (
                        <div className="space-y-2 rounded-md border p-4 max-h-48 overflow-y-auto">
                          {packages.map((pkg) => {
                            const checked = (field.value || []).includes(pkg.id);
                            return (
                              <div key={pkg.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`pkg-${pkg.id}`}
                                  checked={checked}
                                  onCheckedChange={(val) => {
                                    const current = field.value || [];
                                    if (val) {
                                      field.onChange([...current, pkg.id]);
                                    } else {
                                      field.onChange(current.filter((id: string) => id !== pkg.id));
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`pkg-${pkg.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  {pkg.name}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <FormDescription>
                        Select which equipment packages this RFP covers.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               <FormField
                control={form.control}
                name="countryCode"
                render={({ field }) => (
                  <FormItem>
                    <SearchableSelect
                      label="Country"
                      placeholder="Select a country"
                      options={countries}
                      value={field.value}
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {states.length > 0 && (
                <FormField
                  control={form.control}
                  name="stateCode"
                  render={({ field }) => (
                    <FormItem>
                      <SearchableSelect
                        label="State / Province"
                        placeholder="Select a state"
                        options={states}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!watchedCountryCode}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {cities.length > 0 && (
                 <FormField
                  control={form.control}
                  name="cityName"
                  render={({ field }) => (
                    <FormItem>
                      <SearchableSelect
                        label="City"
                        placeholder="Select a city"
                        options={cities}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!watchedStateCode}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
               {(states.length === 0 || cities.length === 0) && !isEditMode && watchedCountryCode && (
                 <FormField
                    control={form.control}
                    name="cityName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter city name" {...field} />
                        </FormControl>
                         <FormMessage />
                      </FormItem>
                    )}
                  />
               )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="openDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Opening Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="closeDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Closing Date</FormLabel>
                     <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <FormField
                control={form.control}
                name="eoiDeadline"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>EOI Response Deadline</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="executionStartDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Execution Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="executionEndDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Execution End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Procurement Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="procurementContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="procurementContactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="procurementContactRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <Input placeholder="Procurement Manager" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="procurementContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 234 567 890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget (USD)</FormLabel>
                  <FormControl>
                    <Input 
                        type="number" 
                        placeholder="e.g., 50000" 
                        {...field} 
                    />
                  </FormControl>
                  <FormDescription>Estimated budget for this project.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="attachedFiles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attach Files</FormLabel>
                  <FormDescription>Upload any relevant documents for this RFP.</FormDescription>
                  <FormControl>
                    <FileUpload
                      value={field.value || []}
                      onChange={field.onChange}
                      folder={`rfps/${rfp?.id ?? 'new'}/attachments`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? 'Save Changes' : 'Create RFP'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
