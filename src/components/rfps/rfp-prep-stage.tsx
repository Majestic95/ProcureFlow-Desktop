import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/file-upload';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';
import type { RFP, RfpPrepStageData } from '@/types';
import { Loader2 } from 'lucide-react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';
import { StageCompletion } from './rfp-detail-client';

const defaultRfpPrepData: RfpPrepStageData = {
  overview: {
    objectives: '',
    scopeSummary: '',
    assumptions: '',
  },
  documentation: {
    hasDraftScope: false,
    hasPricingTemplate: false,
    hasTandCs: false,
    notes: '',
  },
  evaluationDesign: {
    criteriaSummary: '',
    weightingApproach: '',
    mustHaveRequirements: '',
  },
  communicationPlan: {
    bidderQandAProcess: '',
    siteVisitPlan: '',
    keyDatesNotes: '',
  },
  attachments: [],
};

interface RfpPrepStageProps {
  rfp: RFP;
  onUpdate: (updatedData: Partial<RFP>) => void;
  onStageUpdate: (stages: string[], isCompleting: boolean) => void;
}

export function RfpPrepStage({ rfp, onUpdate, onStageUpdate }: RfpPrepStageProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const { control, handleSubmit, reset } = useForm<RfpPrepStageData>({
    defaultValues: defaultRfpPrepData,
  });
  
  useEffect(() => {
    if (rfp.advancedStages?.rfpPrep) {
      reset(rfp.advancedStages.rfpPrep);
    } else {
      reset(defaultRfpPrepData);
    }
  }, [rfp, reset]);

  const handleSave = async (data: RfpPrepStageData) => {
    setIsSaving(true);
    const rfpRef = doc(db, 'rfps', rfp.id);
    const updateData = { advancedStages: { ...rfp.advancedStages, rfpPrep: data } };

    try {
      await updateDoc(rfpRef, updateData as any);
      logAudit({ action: 'rfp.stage_updated', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, details: { stage: 'rfpPrep' } });
      onUpdate(updateData);
      toast({
        title: 'Success',
        description: 'RFP Preparation stage has been saved.',
      });
    } catch (serverError) {
      console.error('Error saving RFP Prep stage:', serverError);
      const permissionError = new FirestorePermissionError({
        path: rfpRef.path,
        operation: 'update',
        requestResourceData: updateData,
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save RFP Preparation data.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">RFP Preparation</CardTitle>
        <CardDescription className="text-xs">
          Capture the key documents and decisions needed before releasing the RFP to market.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6">
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">RFP Overview</h3>
                <Controller
                  name="overview.objectives"
                  control={control}
                  render={({ field }) => (
                    <Textarea placeholder="RFP objectives..." {...field} />
                  )}
                />
                <Controller
                  name="overview.scopeSummary"
                  control={control}
                  render={({ field }) => (
                    <Textarea placeholder="Scope summary..." {...field} />
                  )}
                />
                <Controller
                  name="overview.assumptions"
                  control={control}
                  render={({ field }) => (
                    <Textarea placeholder="Key assumptions & constraints..." {...field} />
                  )}
                />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Documentation Checklist</h3>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Controller name="documentation.hasDraftScope" control={control} render={({ field }) => <Checkbox id="hasDraftScope" checked={field.value} onCheckedChange={field.onChange} />} />
                        <Label htmlFor="hasDraftScope" className="text-sm font-normal">Draft scope of work / technical specification prepared</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Controller name="documentation.hasTandCs" control={control} render={({ field }) => <Checkbox id="hasTandCs" checked={field.value} onCheckedChange={field.onChange} />} />
                        <Label htmlFor="hasTandCs" className="text-sm font-normal">Commercial terms and conditions drafted</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Controller name="documentation.hasPricingTemplate" control={control} render={({ field }) => <Checkbox id="hasPricingTemplate" checked={field.value} onCheckedChange={field.onChange} />} />
                        <Label htmlFor="hasPricingTemplate" className="text-sm font-normal">Pricing template / BOQ prepared</Label>
                    </div>
                </div>
                <Controller
                  name="documentation.notes"
                  control={control}
                  render={({ field }) => (
                    <Textarea placeholder="Notes on document status..." {...field} />
                  )}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Evaluation Design</h3>
                 <Controller name="evaluationDesign.criteriaSummary" control={control} render={({ field }) => <Textarea placeholder="Evaluation criteria summary..." {...field} />} />
                 <Controller name="evaluationDesign.weightingApproach" control={control} render={({ field }) => <Textarea placeholder="Scoring / weighting approach..." {...field} />} />
                 <Controller name="evaluationDesign.mustHaveRequirements" control={control} render={({ field }) => <Textarea placeholder="Must-have requirements..." {...field} />} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Bidder Communication Plan</h3>
                 <Controller name="communicationPlan.bidderQandAProcess" control={control} render={({ field }) => <Textarea placeholder="Q&A / RFI process..." {...field} />} />
                 <Controller name="communicationPlan.siteVisitPlan" control={control} render={({ field }) => <Textarea placeholder="Site visit / clarification meetings plan..." {...field} />} />
                 <Controller name="communicationPlan.keyDatesNotes" control={control} render={({ field }) => <Textarea placeholder="Key milestone notes..." {...field} />} />
              </div>
            </div>
          </div>
          
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">Attachments</h3>
            <p className="text-xs text-muted-foreground">
              Attach draft RFP documents, pricing templates, technical specs, or any other preparation files.
            </p>
            <Controller
              name="attachments"
              control={control}
              defaultValue={[]}
              render={({ field: { value, onChange } }) => (
                <FileUpload value={value} onChange={onChange} folder={`rfps/${rfp.id}/rfp-prep`} />
              )}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit(handleSave)}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save RFP Prep
            </Button>
          </div>
        </form>
      </CardContent>
       <StageCompletion stage="rfp-preparation" rfp={rfp as any} onUpdate={onStageUpdate} />
    </Card>
  );
}
