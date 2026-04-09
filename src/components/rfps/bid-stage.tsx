import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '@/components/file-upload';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, collection, getDocs } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useState, useEffect, useMemo } from 'react';
import type { RFP, BidStageData, Supplier } from '@/types';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';
import { StageCompletion } from './rfp-detail-client';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '../ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { SearchableSelect } from '../ui/searchable-select';

const defaultBidData: BidStageData = {
  launchDetails: {
    issueDate: '',
    submissionDeadline: '',
    clarificationDeadline: '',
    submissionMethod: 'Portal',
    additionalInstructions: '',
  },
  invitedSuppliers: [],
  communicationLog: [],
  submissions: [],
  attachments: [],
};

interface BidStageProps {
  rfp: RFP;
  onUpdate: (updatedData: Partial<RFP>) => void;
  onStageUpdate: (stages: string[], isCompleting: boolean) => void;
}

export function BidStage({ rfp, onUpdate, onStageUpdate }: BidStageProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const { control, handleSubmit, reset, watch } = useForm<BidStageData>({
    defaultValues: defaultBidData,
  });

  const { fields: invitedSuppliersFields, append: appendInvitedSupplier, remove: removeInvitedSupplier } = useFieldArray({ control, name: "invitedSuppliers" });
  const { fields: commsFields, append: appendComm, remove: removeComm } = useFieldArray({ control, name: "communicationLog" });
  const { fields: submissionFields, append: appendSubmission, remove: removeSubmission } = useFieldArray({ control, name: "submissions" });

  useEffect(() => {
    if (rfp.advancedStages?.bid) {
      reset(rfp.advancedStages.bid);
    } else {
      reset(defaultBidData);
    }
  }, [rfp, reset]);

  useEffect(() => {
    const fetchSuppliers = async () => {
        try {
            const suppliersSnapshot = await getDocs(collection(db, 'suppliers'));
            const suppliersData = suppliersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
            setSuppliers(suppliersData);
        } catch (error) {
            console.error("Error fetching suppliers: ", error);
        }
    };
    fetchSuppliers();
  }, []);
  
  const supplierOptions = useMemo(() => suppliers.map(s => ({ value: s.id, label: s.companyName })), [suppliers]);


  const handleSave = async (data: BidStageData) => {
    setIsSaving(true);
    const rfpRef = doc(db, 'rfps', rfp.id);
    const updateData = { advancedStages: { ...rfp.advancedStages, bid: data } };

    try {
      await updateDoc(rfpRef, updateData as any);
      logAudit({ action: 'rfp.stage_updated', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, details: { stage: 'bid' } });
      onUpdate(updateData);
      toast({
        title: 'Success',
        description: 'Bid Management stage has been saved.',
      });
    } catch (serverError) {
      console.error('Error saving BID stage:', serverError);
      const permissionError = new FirestorePermissionError({
        path: rfpRef.path,
        operation: 'update',
        requestResourceData: updateData,
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save Bid Management data.',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Bid Management</CardTitle>
        <CardDescription className="text-xs">
          Track invited suppliers, key bid dates, communications and received submissions for this RFP.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-8">
            {/* Block A - Bid Launch Details */}
            <div className="space-y-4 rounded-md border p-4">
                <h3 className="text-sm font-semibold">Bid Launch Details</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Controller name="launchDetails.issueDate" control={control} render={({ field }) => <DatePicker field={field} label="Issue Date" />} />
                    <Controller name="launchDetails.submissionDeadline" control={control} render={({ field }) => <DatePicker field={field} label="Submission Deadline" />} />
                    <Controller name="launchDetails.clarificationDeadline" control={control} render={({ field }) => <DatePicker field={field} label="Clarification Deadline" />} />
                </div>
                 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Controller name="launchDetails.submissionMethod" control={control} render={({ field }) => (
                        <div>
                            <Label>Submission Method</Label>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger><SelectValue placeholder="Select method..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Portal">Portal</SelectItem>
                                    <SelectItem value="Email">Email</SelectItem>
                                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )} />
                    <Controller name="launchDetails.additionalInstructions" control={control} render={({ field }) => (
                         <div>
                            <Label>Additional Bidder Instructions</Label>
                            <Textarea placeholder="Any specific instructions for bidders..." {...field} />
                        </div>
                    )} />
                </div>
            </div>

            {/* Block B - Invited Suppliers */}
             <div className="space-y-4 rounded-md border p-4">
                <h3 className="text-sm font-semibold">Invited Suppliers</h3>
                {invitedSuppliersFields.map((item, index) => (
                     <div key={item.id} className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-5">
                        <Controller name={`invitedSuppliers.${index}.supplierId`} control={control} render={({ field }) => (
                           <SearchableSelect label="Supplier" options={supplierOptions} value={field.value} onChange={field.onChange} placeholder="Select supplier..."/>
                        )} />
                        <Controller name={`invitedSuppliers.${index}.contactName`} control={control} render={({ field }) => (<div><Label>Contact Name</Label><Input {...field} /></div>)} />
                        <Controller name={`invitedSuppliers.${index}.contactEmail`} control={control} render={({ field }) => (<div><Label>Contact Email</Label><Input type="email" {...field} /></div>)} />
                        <Controller name={`invitedSuppliers.${index}.status`} control={control} render={({ field }) => (
                             <div>
                                <Label>Status</Label>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="invited">Invited</SelectItem>
                                        <SelectItem value="declined">Declined</SelectItem>
                                        <SelectItem value="confirmed">Confirmed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )} />
                         <Button variant="ghost" size="icon" onClick={() => removeInvitedSupplier(index)} className="self-end"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendInvitedSupplier({ supplierId: '', supplierName: '', status: 'invited' })}><PlusCircle className="mr-2 h-4 w-4" /> Add Supplier</Button>
            </div>

            {/* Block C - Communication & Submissions */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4 rounded-md border p-4">
                     <h3 className="text-sm font-semibold">Communication Log</h3>
                     <p className="text-xs text-muted-foreground">Record clarifications, addenda and notices issued to bidders.</p>
                     {commsFields.map((item, index) => (
                         <div key={item.id} className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-3">
                             <Controller name={`communicationLog.${index}.date`} control={control} render={({ field }) => <DatePicker field={field} label="Date" />} />
                             <Controller name={`communicationLog.${index}.type`} control={control} render={({ field }) => (
                                <div><Label>Type</Label>
                                <Select onValueChange={field.onChange} value={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
                                    <SelectItem value="clarification">Clarification</SelectItem>
                                    <SelectItem value="addendum">Addendum</SelectItem>
                                    <SelectItem value="notice">Notice</SelectItem>
                                </SelectContent></Select></div>
                             )} />
                             <Controller name={`communicationLog.${index}.summary`} control={control} render={({ field }) => (<div><Label>Summary</Label><Input {...field} /></div>)} />
                             <Button variant="ghost" size="icon" onClick={() => removeComm(index)} className="col-span-full justify-self-end"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                         </div>
                     ))}
                     <Button type="button" variant="outline" size="sm" onClick={() => appendComm({ id: crypto.randomUUID(), date: new Date().toISOString(), type: 'clarification', summary: '' })}><PlusCircle className="mr-2 h-4 w-4"/> Add Entry</Button>
                </div>
                 <div className="space-y-4 rounded-md border p-4">
                     <h3 className="text-sm font-semibold">Submissions</h3>
                     <p className="text-xs text-muted-foreground">Track when each supplier submits their bid.</p>
                      {submissionFields.map((item, index) => (
                         <div key={item.id} className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-3">
                             <Controller name={`submissions.${index}.supplierId`} control={control} render={({ field }) => (
                                 <SearchableSelect label="Supplier" options={supplierOptions} value={field.value} onChange={field.onChange} placeholder="Select supplier..."/>
                             )} />
                             <Controller name={`submissions.${index}.receivedOn`} control={control} render={({ field }) => <DatePicker field={field} label="Received On" />} />
                             <Controller name={`submissions.${index}.submissionStatus`} control={control} render={({ field }) => (
                                <div><Label>Status</Label>
                                <Select onValueChange={field.onChange} value={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
                                    <SelectItem value="not_received">Not Received</SelectItem>
                                    <SelectItem value="received">Received</SelectItem>
                                    <SelectItem value="late">Late</SelectItem>
                                </SelectContent></Select></div>
                             )} />
                             <Controller name={`submissions.${index}.notes`} control={control} render={({ field }) => (<div className="col-span-full"><Label>Notes</Label><Textarea {...field} /></div>)} />
                             <Button variant="ghost" size="icon" onClick={() => removeSubmission(index)} className="col-span-full justify-self-end"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                         </div>
                     ))}
                     <Button type="button" variant="outline" size="sm" onClick={() => appendSubmission({ supplierId: '', supplierName: '', submissionStatus: 'not_received', notes: ''})}><PlusCircle className="mr-2 h-4 w-4"/> Add Submission</Button>
                </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2 rounded-md border p-4">
                <h3 className="text-sm font-semibold">Bid Package Attachments</h3>
                <p className="text-xs text-muted-foreground">Upload issued RFP documents, addenda or any other bid-related files.</p>
                <Controller name="attachments" control={control} defaultValue={[]} render={({ field: { value, onChange } }) => (
                    <FileUpload value={value} onChange={onChange} folder={`rfps/${rfp.id}/bid`} />
                )} />
            </div>

            <div className="flex justify-end">
                <Button type="button" size="sm" onClick={handleSubmit(handleSave)} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save BID Stage
                </Button>
            </div>
        </form>
      </CardContent>
      <StageCompletion stage="bid" rfp={rfp as any} onUpdate={onStageUpdate} />
    </Card>
  );
}

const DatePicker = ({ field, label }: { field: any, label: string }) => (
    <div>
        <Label>{label}</Label>
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={field.value ? new Date(field.value) : undefined} onSelect={(date) => field.onChange(date?.toISOString())} initialFocus />
            </PopoverContent>
        </Popover>
    </div>
);
