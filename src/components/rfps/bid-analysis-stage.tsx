import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, collection, getDocs, query, where } from '@/lib/firestore-compat';
import { db, storage } from '@/lib/firebase';
import { useState, useEffect, useMemo } from 'react';
import type { RFP, BidAnalysisStageData, Proposal, Supplier } from '@/types';
import { Loader2, Bot, Plus, Trash2 } from 'lucide-react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';
import { StageCompletion } from './rfp-detail-client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { runAnalysis } from '@/ai/flows/run-analysis';
import { ref, getMetadata } from "@/lib/file-storage";
import { format } from 'date-fns';
import { Input } from '../ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ResponsiveContainer,
    Cell
} from 'recharts';
import { cn } from '@/lib/utils';

const defaultBidAnalysisData: BidAnalysisStageData = {
  evaluationApproach: '',
  commercialSummary: '',
  technicalSummary: '',
  riskSummary: '',
  recommendationNotes: '',
  aiSummary: '',
  lastAiRunAt: '',
  proposals: [],
};

interface BidAnalysisStageProps {
  rfp: RFP;
  onUpdate: (updatedData: Partial<RFP>) => void;
  onStageUpdate: (stages: string[], isCompleting: boolean) => void;
}

export function BidAnalysisStage({ rfp, onUpdate, onStageUpdate }: BidAnalysisStageProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [suppliers, setSuppliers] = useState<Map<string, Supplier>>(new Map());
  const [loadingProposals, setLoadingProposals] = useState(true);

  const { control, handleSubmit, reset, watch, setValue, register } = useForm<BidAnalysisStageData>({
    defaultValues: defaultBidAnalysisData,
  });
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: "proposals",
  });


  useEffect(() => {
    if (rfp.advancedStages?.bidAnalysis) {
      reset(rfp.advancedStages.bidAnalysis);
    } else {
      reset(defaultBidAnalysisData);
    }
  }, [rfp, reset]);

  useEffect(() => {
    const fetchProposalsForAI = async () => {
      setLoadingProposals(true);
      try {
        const proposalsQuery = query(collection(db, 'proposals'), where('rfpId', '==', rfp.id));
        const proposalsSnapshot = await getDocs(proposalsQuery);
        const fetchedProposals = proposalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Proposal));
        setProposals(fetchedProposals);

        if (fetchedProposals.length > 0) {
          const supplierIds = [...new Set(fetchedProposals.map(p => p.supplierId))];
          if (supplierIds.length > 0) {
            const suppliersQuery = query(collection(db, 'suppliers'), where('__name__', 'in', supplierIds));
            const suppliersSnapshot = await getDocs(suppliersQuery);
            const fetchedSuppliers = new Map<string, Supplier>();
            suppliersSnapshot.docs.forEach(doc => {
              fetchedSuppliers.set(doc.id, { id: doc.id, ...doc.data() } as Supplier);
            });
            setSuppliers(fetchedSuppliers);
          }
        }
      } catch (e: any) {
        console.error("Error fetching proposals:", e);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load proposals for AI analysis.' });
      } finally {
        setLoadingProposals(false);
      }
    };
    fetchProposalsForAI();
  }, [rfp.id, toast]);
  
  const handleSave = async (data: BidAnalysisStageData) => {
    setIsSaving(true);
    const rfpRef = doc(db, 'rfps', rfp.id);
    const updateData = { advancedStages: { ...rfp.advancedStages, bidAnalysis: data } };

    try {
      await updateDoc(rfpRef, updateData as any);
      logAudit({ action: 'rfp.stage_updated', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, details: { stage: 'bidAnalysis' } });
      onUpdate(updateData);
      toast({
        title: 'Success',
        description: 'Bid Analysis stage has been saved.',
      });
    } catch (serverError) {
      console.error('Error saving Bid Analysis stage:', serverError);
      const permissionError = new FirestorePermissionError({
        path: rfpRef.path,
        operation: 'update',
        requestResourceData: updateData,
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save Bid Analysis data.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunAiAnalysis = async () => {
    if (proposals.length === 0) {
      toast({ variant: 'destructive', title: 'No proposals to analyze' });
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
       const documentsForAnalysis = (await Promise.all(
          proposals.map(async (proposal) => {
            const supplierName = suppliers.get(proposal.supplierId)?.companyName || 'Unknown Supplier';
            if (!proposal.attachments || proposal.attachments.length === 0) return [];
            return Promise.all(
              (proposal.attachments).map(async (attachment) => {
                const storageRef = ref(storage, attachment.url);
                const metadata = await getMetadata(storageRef);
                return {
                  name: `${attachment.name} (Supplier: ${supplierName})`,
                  url: attachment.url,
                  contentType: metadata.contentType || 'application/octet-stream',
                };
              })
            );
          })
        )).flat();

      const result = await runAnalysis({
          rfpId: rfp.id,
          rfpTitle: rfp.title,
          rfpDescription: rfp.description,
          documents: documentsForAnalysis,
      });

      if (!result.summary) throw new Error("AI analysis did not return a summary.");

      setValue('aiSummary', result.summary);
      setValue('lastAiRunAt', new Date().toISOString());
      
      if (result._warnings && result._warnings.length > 0) {
        toast({
          variant: 'destructive',
          title: 'AI Analysis Complete — Review Required',
          description: result._warnings.join(' '),
        });
      } else {
        toast({
          title: 'AI Analysis Complete',
          description: 'The AI summary has been generated. Remember to save the stage.',
        });
      }

    } catch (error: any) {
        console.error("AI analysis error:", error);
        setAiError(error.message || "An unknown error occurred during AI analysis.");
    } finally {
        setAiLoading(false);
    }
  };
  
  const lastAiRunAt = watch('lastAiRunAt');
  const aiSummary = watch('aiSummary');
  const currentProposals = watch('proposals') || [];

  const chartData = useMemo(() => {
    const criteria = [
      { key: 'commScore', label: 'Commercial' },
      { key: 'ehsScore', label: 'EHS' },
      { key: 'schedScore', label: 'Schedule' },
      { key: 'qualScore', label: 'Quality' },
      { key: 'riskScore', label: 'Risk' },
    ];

    return criteria.map(c => {
      const entry: any = { name: c.label };
      currentProposals.forEach(p => {
        if (p.supplierName) {
          entry[p.supplierName] = p[c.key as keyof typeof p] || 0;
        }
      });
      return entry;
    });
  }, [currentProposals]);

  const supplierNames = useMemo(() => {
    return currentProposals
      .map(p => p.supplierName)
      .filter(name => !!name);
  }, [currentProposals]);

  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
            <div>
                <CardTitle className="text-lg font-semibold">Bid Analysis</CardTitle>
                <CardDescription className="text-xs">
                    Summarize the commercial and technical evaluation of the proposals and capture your recommendation.
                </CardDescription>
            </div>
             <div className="flex flex-col items-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={aiLoading || loadingProposals || proposals.length === 0} onClick={handleRunAiAnalysis}>
                    {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                    {aiLoading ? 'Running AI Analysis...' : 'Run AI Bid Analysis'}
                </Button>
                {aiError && <p className="text-xs text-destructive">{aiError}</p>}
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit(handleSave)}>
             <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Proposals Summary</h3>
                     <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() =>
                            append({
                            id: crypto.randomUUID(),
                            supplierName: "",
                            status: "Not received",
                            totalPrice: null,
                            commScore: null,
                            ehsScore: null,
                            schedScore: null,
                            qualScore: null,
                            riskScore: null,
                            })
                        }
                        >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Total Price</TableHead>
                                <TableHead>Comm Score</TableHead>
                                <TableHead>EHS</TableHead>
                                <TableHead>Sched</TableHead>
                                <TableHead>Qual</TableHead>
                                <TableHead>Risk</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                                        No proposals added yet. Click &apos;+&apos; to add one.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                fields.map((field, index) => (
                                    <TableRow key={field.id}>
                                    <TableCell className="py-2">
                                        <Input
                                        {...register(`proposals.${index}.supplierName` as const)}
                                        className="h-8 text-xs"
                                        placeholder="Supplier"
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Select
                                            onValueChange={(value) => setValue(`proposals.${index}.status`, value as "Not received" | "Received" | "Late")}
                                            defaultValue={field.status}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Not received">Not received</SelectItem>
                                                <SelectItem value="Received">Received</SelectItem>
                                                <SelectItem value="Late">Late</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Input
                                        type="number"
                                        step="0.01"
                                        {...register(`proposals.${index}.totalPrice` as const, { valueAsNumber: true })}
                                        className="h-8 text-xs"
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Input
                                        type="number"
                                        step="0.1"
                                        {...register(`proposals.${index}.commScore` as const, { valueAsNumber: true })}
                                        className="h-8 text-xs min-w-[60px]"
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Input
                                        type="number"
                                        step="0.1"
                                        {...register(`proposals.${index}.ehsScore` as const, { valueAsNumber: true })}
                                        className="h-8 text-xs min-w-[60px]"
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Input
                                        type="number"
                                        step="0.1"
                                        {...register(`proposals.${index}.schedScore` as const, { valueAsNumber: true })}
                                        className="h-8 text-xs min-w-[60px]"
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <Input
                                        type="number"
                                        step="0.1"
                                        {...register(`proposals.${index}.qualScore` as const, { valueAsNumber: true })}
                                        className="h-8 text-xs min-w-[60px]"
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <div className="flex items-center justify-between">
                                        <Input
                                            type="number"
                                            step="0.1"
                                            {...register(`proposals.${index}.riskScore` as const, { valueAsNumber: true })}
                                            className="h-8 text-xs min-w-[60px]"
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="ml-2 h-7 w-7"
                                            onClick={() => remove(index)}
                                        >
                                            <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                        </div>
                                    </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {supplierNames.length > 0 && (
                <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Criteria Comparison</h3>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Scores by Supplier</p>
                    </div>
                    <div className="border rounded-xl bg-muted/10 p-6">
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={chartData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                                    barGap={8}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fontWeight: 500, fill: '#64748B' }}
                                        dy={10}
                                    />
                                    <YAxis 
                                        domain={[0, 100]} 
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#64748B' }}
                                        tickCount={6}
                                    />
                                    <Tooltip 
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ 
                                            borderRadius: '12px', 
                                            border: 'none', 
                                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <Legend 
                                        verticalAlign="top" 
                                        align="right"
                                        height={36}
                                        iconType="circle"
                                        wrapperStyle={{ paddingBottom: '20px', fontSize: '11px' }}
                                    />
                                    {supplierNames.map((name, index) => (
                                        <Bar 
                                            key={name} 
                                            dataKey={name} 
                                            fill={COLORS[index % COLORS.length]} 
                                            radius={[4, 4, 0, 0]} 
                                            barSize={32}
                                            animationDuration={1500}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
            <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                <Controller name="evaluationApproach" control={control} render={({ field }) => (<div><Label className="text-sm">Evaluation Approach</Label><Textarea placeholder="How scoring was handled, weighting, pass/fail..." {...field} /></div>)} />
                <Controller name="commercialSummary" control={control} render={({ field }) => (<div><Label className="text-sm">Commercial Summary</Label><Textarea placeholder="Comparison of pricing, alternates, normalization notes..." {...field} /></div>)} />
                </div>
                <div className="space-y-4">
                <Controller name="technicalSummary" control={control} render={({ field }) => (<div><Label className="text-sm">Technical Summary</Label><Textarea placeholder="Strengths, weaknesses, compliance with scope..." {...field} /></div>)} />
                <Controller name="riskSummary" control={control} render={({ field }) => (<div><Label className="text-sm">Risk Summary</Label><Textarea placeholder="Key risks, contractual deviations, exclusions..." {...field} /></div>)} />
                </div>
            </div>
            <Controller name="recommendationNotes" control={control} render={({ field }) => (<div><Label className="text-sm">Recommendation Notes</Label><Textarea placeholder="Proposed ranking, preferred bidder, and rationale..." {...field} /></div>)} />
            
            {aiSummary && (
                    <div className="mt-4 space-y-1">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">AI Comparison Summary</h3>
                            {lastAiRunAt && <span className="text-xs text-muted-foreground">Last run: {format(new Date(lastAiRunAt), 'MMM d, yyyy, p')}</span>}
                        </div>
                        <div className="text-sm whitespace-pre-wrap font-mono p-4 bg-muted rounded-md border min-h-[100px]">
                            {aiSummary}
                        </div>
                    </div>
                )}

            <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Analysis
                </Button>
            </div>
        </form>
      </CardContent>
      <StageCompletion stage="initial-bid-analysis" rfp={rfp as any} onUpdate={onStageUpdate} />
    </Card>
  );
}
