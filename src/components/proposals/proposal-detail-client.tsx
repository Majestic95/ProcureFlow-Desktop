import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { db, storage } from '@/lib/firebase';
import type { Proposal, RFP, Supplier } from '@/types';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from '@/lib/firestore-compat';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, ChevronRight } from 'lucide-react';
import { Loader2, FileText, Bot, PlusCircle, X, Settings, DollarSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { format } from 'date-fns';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '../ui/input';
import { cn, ensureDate, ensureIsoString } from '@/lib/utils';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { runAnalysis } from '@/ai/flows/run-analysis';
import { useToast } from '@/hooks/use-toast';
import { ref, getMetadata } from "@/lib/file-storage";
import { FileUpload } from '../file-upload';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { logAudit } from '@/lib/audit';
import { NotesButton } from '@/components/notes/notes-button';


const evaluationSchema = z.object({
  price: z.coerce.number().min(0, 'Price must be at least 0'),
  aiSummary: z.string().default(''),
  commercialScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  ehsScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  scheduleScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  qualityScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  riskScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  evaluatorComments: z.string().min(10, 'Comments must be at least 10 characters.'),
});

async function getProposalData(proposalId: string): Promise<{ proposal: Proposal, allProposals: Proposal[], rfp: RFP, supplier: Supplier } | null> {
    const proposalRef = doc(db, 'proposals', proposalId);
    const proposalSnap = await getDoc(proposalRef);

    if (!proposalSnap.exists()) {
        return null;
    }

    const currentProposal = { id: proposalSnap.id, ...proposalSnap.data() } as Proposal;

    // Fetch all proposals for this supplier and RFP
    const proposalsQuery = query(
        collection(db, 'proposals'),
        where('rfpId', '==', currentProposal.rfpId),
        where('supplierId', '==', currentProposal.supplierId)
    );
    const proposalsSnap = await getDocs(proposalsQuery);
    const allProposals = proposalsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        submittedAt: ensureIsoString(doc.data().submittedAt)
    } as unknown as Proposal)).sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));

    const rfpRef = doc(db, 'rfps', currentProposal.rfpId);
    const supplierRef = doc(db, 'suppliers', currentProposal.supplierId);

    const [rfpSnap, supplierSnap] = await Promise.all([
        getDoc(rfpRef),
        getDoc(supplierRef),
    ]);

    if (!rfpSnap.exists() || !supplierSnap.exists()) {
        return null;
    }

    const rfp = { id: rfpSnap.id, ...rfpSnap.data() } as RFP;
    const supplier = { id: supplierSnap.id, ...supplierSnap.data() } as Supplier;
    
    // Serialize dates
    const serializedProposal = {
        ...currentProposal,
        submittedAt: ensureIsoString(currentProposal.submittedAt),
    } as any;
    
    const serializedRfp = {
        ...rfp,
        openDate: ensureIsoString(rfp.openDate),
        closeDate: ensureIsoString(rfp.closeDate),
        createdAt: ensureIsoString(rfp.createdAt),
    } as any;

    const serializedSupplier = {
        ...supplier,
        createdAt: ensureIsoString(supplier.createdAt),
    } as any;

    return { proposal: serializedProposal, allProposals, rfp: serializedRfp, supplier: serializedSupplier };
}


export function ProposalDetailClient({ proposalId }: { proposalId: string }) {
    const [data, setData] = useState<{ proposal: Proposal, allProposals: Proposal[], rfp: RFP, supplier: Supplier } | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isAnalyzingForm, setIsAnalyzingForm] = useState(false);
    const [isEditingWeights, setIsEditingWeights] = useState(false);
    const [weights, setWeights] = useState({
        commercial: 0.4,
        ehs: 0.15,
        schedule: 0.15,
        quality: 0.15,
        risk: 0.15,
    });
    const [showUploader, setShowUploader] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { toast } = useToast();

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(evaluationSchema),
        defaultValues: {
            price: 0,
            aiSummary: '',
            commercialScore: 0,
            ehsScore: 0,
            scheduleScore: 0,
            qualityScore: 0,
            riskScore: 0,
            evaluatorComments: '',
        },
    });

    useEffect(() => {
      if (data?.proposal) {
        setValue('price', data.proposal.price || 0);
        setValue('aiSummary', data.proposal.aiSummary || '');
        setValue('commercialScore', data.proposal.commercialScore || 0);
        setValue('ehsScore', data.proposal.ehsScore || 0);
        setValue('scheduleScore', data.proposal.scheduleScore || 0);
        setValue('qualityScore', data.proposal.qualityScore || 0);
        setValue('riskScore', data.proposal.riskScore || 0);
        setValue('evaluatorComments', data.proposal.evaluatorComments || '');
      }
    }, [data, setValue]);

    const commercialScore = watch('commercialScore');
    const ehsScore = watch('ehsScore');
    const scheduleScore = watch('scheduleScore');
    const qualityScore = watch('qualityScore');
    const riskScore = watch('riskScore');
    
    useEffect(() => {
      if (data?.rfp?.evaluationWeights) {
        setWeights(data.rfp.evaluationWeights);
      }
    }, [data?.rfp]);

    const finalScore = (
        commercialScore * weights.commercial + 
        ehsScore * weights.ehs + 
        scheduleScore * weights.schedule + 
        qualityScore * weights.quality + 
        riskScore * weights.risk
    ).toFixed(2);


    useEffect(() => {
        getProposalData(proposalId)
        .then(fetchedData => {
            if (fetchedData) {
                setData(fetchedData);
            } else {
                setError('Proposal not found.');
            }
        })
        .catch(e => {
            console.error(e);
            setError(e.message || 'Failed to fetch proposal details.');
        })
        .finally(() => {
            setLoading(false);
        });
    }, [proposalId]);

    const handleAttachmentsChange = async (newFiles: { name: string; url: string }[]) => {
        if (!data) return;
        const proposalRef = doc(db, 'proposals', data.proposal.id);
        const isRemovingAll = newFiles.length === 0;

        const updateData: Partial<Proposal> = {
            attachments: newFiles,
        };

        // If all documents are removed, clear the derived data
        if (isRemovingAll) {
            updateData.aiSummary = '';
            updateData.price = 0;
            updateData.commercialScore = 0;
            updateData.ehsScore = 0;
            updateData.scheduleScore = 0;
            updateData.qualityScore = 0;
            updateData.riskScore = 0;
            updateData.finalScore = 0;
            updateData.evaluatorComments = '';
        }

        try {
            await updateDoc(proposalRef, updateData as any);
            const newProposalState = { ...data.proposal, ...updateData };
            setData({ ...data, proposal: newProposalState });
            if (isRemovingAll) {
                setValue('commercialScore', 0);
                setValue('ehsScore', 0);
                setValue('scheduleScore', 0);
                setValue('qualityScore', 0);
                setValue('riskScore', 0);
                setValue('evaluatorComments', '');
            }
            toast({ title: 'Success', description: 'Attachments updated successfully.' });
        } catch (serverError) {
            const permissionError = new FirestorePermissionError({
                path: proposalRef.path,
                operation: 'update',
                requestResourceData: updateData,
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update attachments.' });
        }
    };

    const handleRunAnalysis = async () => {
        if (!data) return;
    
        setIsAnalyzing(true);
        try {
            const documentsForAnalysis = await Promise.all(
                (data.proposal.attachments || []).map(async (attachment) => {
                    const storageRef = ref(storage, attachment.url);
                    const metadata = await getMetadata(storageRef);
                    return {
                        name: attachment.name,
                        url: attachment.url,
                        contentType: metadata.contentType || 'application/octet-stream',
                    };
                })
            );

            const result = await runAnalysis({
                rfpId: data.rfp.id,
                rfpTitle: `${data.rfp.title} (Evaluation for Supplier: ${data.supplier.companyName})`,
                rfpDescription: data.rfp.description,
                documents: documentsForAnalysis,
            });
    
          const updateData: Partial<Proposal> = {
            aiSummary: result.summary,
            price: result.price ?? data.proposal.price,
            commercialScore: result.commercialScore ?? data.proposal.commercialScore,
            ehsScore: result.ehsScore ?? data.proposal.ehsScore,
            scheduleScore: result.scheduleScore ?? data.proposal.scheduleScore,
            qualityScore: result.qualityScore ?? data.proposal.qualityScore,
            riskScore: result.riskScore ?? data.proposal.riskScore,
          };

          // Update form values directly to reflect AI scores
          if (result.commercialScore !== undefined) setValue('commercialScore', result.commercialScore);
          if (result.ehsScore !== undefined) setValue('ehsScore', result.ehsScore);
          if (result.scheduleScore !== undefined) setValue('scheduleScore', result.scheduleScore);
          if (result.qualityScore !== undefined) setValue('qualityScore', result.qualityScore);
          if (result.riskScore !== undefined) setValue('riskScore', result.riskScore);
          if (result.evaluatorComments !== undefined) setValue('evaluatorComments', result.evaluatorComments);
    
          // Update the proposal in Firestore with the new analysis
          const proposalRef = doc(db, 'proposals', data.proposal.id);
          await updateDoc(proposalRef, updateData as any);
          logAudit({ action: 'proposal.ai_analysis', category: 'proposal', targetCollection: 'proposals', targetDocId: proposalId, details: { rfpTitle: data?.rfp?.title, supplierName: data?.supplier?.companyName } });

          // Update local state to reflect changes
          setData(prevData => {
            if (!prevData) return null;
            const updatedProposal = { ...prevData.proposal, ...updateData };
            return { ...prevData, proposal: updatedProposal };
          });
          
          if (result._warnings && result._warnings.length > 0) {
            toast({
              variant: 'destructive',
              title: 'Analysis Complete — Review Required',
              description: result._warnings.join(' '),
            });
          } else {
            toast({
              title: 'Analysis Complete',
              description: 'The AI evaluation has finished.',
            });
          }
        } catch (error) {
          console.error('AI Analysis Error:', error);
          toast({
            variant: 'destructive',
            title: 'Analysis Failed',
            description: 'An error occurred during AI evaluation. Please try again.',
          });
        } finally {
          setIsAnalyzing(false);
        }
      };


    const onSubmit = async (formData: z.infer<typeof evaluationSchema>) => {
        if (!data) return;
        setIsSubmitting(true);
        const proposalRef = doc(db, 'proposals', data.proposal.id);
        const submissionData = {
          price: formData.price,
          aiSummary: formData.aiSummary,
          commercialScore: formData.commercialScore,
          ehsScore: formData.ehsScore,
          scheduleScore: formData.scheduleScore,
          qualityScore: formData.qualityScore,
          riskScore: formData.riskScore,
          evaluatorComments: formData.evaluatorComments,
          finalScore: parseFloat(finalScore),
          status: 'underReview' as const,
        };
    
        updateDoc(proposalRef, submissionData)
          .then(() => {
            logAudit({ action: 'proposal.scored', category: 'proposal', targetCollection: 'proposals', targetDocId: proposalId, details: { finalScore: submissionData.finalScore, rfpTitle: data?.rfp?.title, supplierName: data?.supplier?.companyName } });
            toast({ title: 'Success', description: 'Evaluation submitted successfully.' });
            setData(prev => {
              if (!prev) return null;
              return { 
                ...prev, 
                proposal: { 
                  ...prev.proposal, 
                  ...submissionData,
                  aiSummary: submissionData.aiSummary || prev.proposal.aiSummary 
                } 
              };
            });
          })
          .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
              path: proposalRef.path,
              operation: 'update',
              requestResourceData: submissionData,
            });
            errorEmitter.emit('permission-error', permissionError);
          })
          .finally(() => {
            setIsSubmitting(false);
          });
      };

    const handleSaveWeights = async () => {
        if (!data) return;
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        if (Math.abs(total - 1) > 0.01) {
            toast({ variant: 'destructive', title: 'Invalid Weights', description: 'Weights must sum to 1.0 (currently ' + total.toFixed(2) + ')' });
            return;
        }

        const rfpRef = doc(db, 'rfps', data.rfp.id);
        try {
            await updateDoc(rfpRef, { evaluationWeights: weights });
            setData({ ...data, rfp: { ...data.rfp, evaluationWeights: weights } });
            setIsEditingWeights(false);
            toast({ title: 'Success', description: 'Evaluation weights updated.' });
        } catch (error) {
            console.error('Error saving weights:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to save weights.' });
        }
    };

    if (loading) {
        return (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        );
    }

    if (error) {
        return <div className="text-destructive text-center p-4">{error}</div>
    }

    if (!data) {
        return <div className="text-center p-4">No proposal data available.</div>
    }

    const { proposal, rfp, supplier } = data;

    return (
        <div className="container mx-auto py-2 space-y-6">
            <div className="flex justify-between items-start">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight">Proposal Evaluation</h1>
                        <NotesButton entityType="rfp" entityId={rfp.id} entityName={rfp.title} />
                        <p className="text-sm text-muted-foreground">For RFP: <span className="font-semibold text-primary">{rfp.title}</span></p>
                        <p className="text-sm text-muted-foreground">From Supplier: <span className="font-semibold text-primary">{supplier.companyName}</span></p>
                    </div>

                    <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-xl border border-border">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-lg border shadow-sm">
                            <History className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Revision Select</span>
                        </div>
                        <Select 
                            value={proposal.id} 
                            onValueChange={(val) => {
                                const selected = data.allProposals.find(p => p.id === val);
                                if (selected) {
                                    setData({ ...data, proposal: selected });
                                    // Update the URL without refreshing to keep context
                                    window.history.pushState(null, '', `/dashboard/proposals/${val}`);
                                }
                            }}
                        >
                            <SelectTrigger className="w-[200px] h-9 bg-background border-primary/20 hover:border-primary/40 transition-all font-semibold">
                                <SelectValue placeholder="Select Revision" />
                            </SelectTrigger>
                            <SelectContent>
                                {data.allProposals.map((p) => (
                                    <SelectItem key={p.id} value={p.id} className="font-medium">
                                        Revision {p.revision ?? 0} {p.id === proposalId ? '(Original Selection)' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate(`/dashboard/rfps/${rfp.id}`)}>View RFP</Button>
                    <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-semibold">Attached Documents</CardTitle>
                                <CardDescription className="text-xs">All documents submitted with this proposal.</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setShowUploader(!showUploader)}>
                                {showUploader ? <X className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                {showUploader ? 'Cancel' : 'Add Document'}
                            </Button>
                        </CardHeader>
                        <CardContent>
                             {showUploader && (
                                <div className="mb-4">
                                <FileUpload
                                    value={proposal.attachments || []}
                                    onChange={(newFiles) => {
                                        handleAttachmentsChange(newFiles);
                                        setShowUploader(false);
                                    }}
                                    folder={`proposals/${proposal.id}/attachments`}
                                />
                                </div>
                             )}
                             {proposal.attachments && proposal.attachments.length > 0 ? (
                                <ul className="space-y-2">
                                    {proposal.attachments.map((doc, i) => (
                                        <li key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-muted-foreground"/>
                                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm font-medium">{doc.name}</a>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleAttachmentsChange(proposal.attachments.filter(f => f.url !== doc.url))}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                !showUploader && <p className="text-sm text-muted-foreground text-center py-4">No documents were attached to this proposal.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Bot className="h-6 w-6" />
                                    <CardTitle className="text-lg font-semibold">AI Analysis</CardTitle>
                                </div>
                                 <Button onClick={handleRunAnalysis} disabled={isAnalyzing || !proposal.attachments || proposal.attachments.length === 0}>
                                    {isAnalyzing ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Bot className="mr-2 h-4 w-4" />
                                    )}
                                    AI Evaluation
                                </Button>
                            </div>
                            <CardDescription className="text-xs">AI-generated summary and evaluation of the proposal.</CardDescription>
                        </CardHeader>
                         <CardContent>
                            {isAnalyzing ? (
                                <div className="flex items-center justify-center p-8 text-primary animate-pulse">
                                    <Bot className="mr-3 h-8 w-8 animate-spin" />
                                    <p className="font-bold tracking-tight">AI Analysis in progress...</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">Summary Content (Editable)</Label>
                                    <Controller
                                        name="aiSummary"
                                        control={control}
                                        render={({ field }) => (
                                            <Textarea 
                                                {...field} 
                                                className="min-h-[250px] font-mono text-sm bg-muted/20 border-primary/10 focus:border-primary/30 transition-all leading-relaxed"
                                                placeholder="Enter or refine the proposal summary..."
                                            />
                                        )}
                                    />
                                    {watch('aiSummary') && (
                                        <div className="pt-4 border-t border-dashed">
                                            <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1 mb-2 block">Markdown Preview</Label>
                                            <div className="prose prose-sm max-w-none rounded-xl border bg-muted/40 p-6 shadow-inner">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml={true}>
                                                    {watch('aiSummary') || ''}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold">Key Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div>
                             <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">Submitted Price (Manual Edit)</Label>
                                <div className="relative group">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <Controller
                                        name="price"
                                        control={control}
                                        render={({ field }) => (
                                            <Input 
                                                type="number" 
                                                {...field} 
                                                className="pl-9 h-12 text-lg font-bold bg-muted/10 border-primary/10 focus:border-primary/30 transition-all"
                                            />
                                        )}
                                    / >
                                </div>
                                {errors.price && <p className="text-xs text-destructive font-semibold">{errors.price.message}</p>}
                            </div>
                            </div>
                             <div>
                                <Label className="text-xs text-muted-foreground">Status</Label>
                                <p className="font-semibold text-sm">{proposal.status}</p>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Submitted At</Label>
                                <p className="font-semibold text-sm">{format(ensureDate(proposal.submittedAt), 'MMM d, yyyy, p')}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold">Evaluation Form</CardTitle>
                            <div className="flex items-center gap-2">
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => setIsEditingWeights(!isEditingWeights)}
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>
                                <Button 
                                    type="button" 
                                    size="sm" 
                                    variant="outline" 
                                    disabled={isAnalyzing || isAnalyzingForm || !proposal.attachments || proposal.attachments.length === 0} 
                                    onClick={async () => {
                                        setIsAnalyzingForm(true);
                                        await handleRunAnalysis();
                                        setIsAnalyzingForm(false);
                                    }}
                                >
                                    {isAnalyzingForm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-3.5 w-3.5" />}
                                    AI
                                </Button>
                            </div>
                        </div>
                        <CardDescription className="text-xs">
                            {isEditingWeights ? (
                                <div className="space-y-3 p-3 border rounded-md bg-muted/20 mt-2">
                                    <p className="font-semibold mb-2">Configure Weights (must sum to 1.0)</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {Object.entries(weights).map(([key, value]) => (
                                            <div key={key} className="space-y-1">
                                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">{key}</Label>
                                                <Input 
                                                    type="number" 
                                                    step="0.05" 
                                                    value={value} 
                                                    onChange={(e) => setWeights({ ...weights, [key]: parseFloat(e.target.value) || 0 })}
                                                    className="h-7 text-xs"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed">
                                        <span className={cn("text-xs font-bold", Math.abs(Object.values(weights).reduce((a,b)=>a+b,0) - 1) > 0.01 ? "text-destructive" : "text-green-600")}>
                                            Total: {Object.values(weights).reduce((a,b)=>a+b,0).toFixed(2)}
                                        </span>
                                        <div className="flex gap-2">
                                             <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setIsEditingWeights(false)}>Cancel</Button>
                                             <Button size="sm" className="h-6 text-[10px]" onClick={handleSaveWeights}>Save Weights</Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                `Final score: (Comm * ${weights.commercial}) + (EHS * ${weights.ehs}) + (Sched * ${weights.schedule}) + (Qual * ${weights.quality}) + (Risk * ${weights.risk})`
                            )}
                        </CardDescription>
                        </CardHeader>
                        <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="commercial-score" className="text-sm">
                                Commercial Score (0-100)
                                </Label>
                                <Controller
                                name="commercialScore"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                    id="commercial-score"
                                    type="number"
                                    placeholder="e.g., 92"
                                    {...field}
                                    />
                                )}
                                />
                                {errors.commercialScore && (
                                <p className="text-sm text-destructive">
                                    {errors.commercialScore.message}
                                </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ehs-score" className="text-sm">
                                EHS Score (0-100)
                                </Label>
                                <Controller
                                name="ehsScore"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                    id="ehs-score"
                                    type="number"
                                    placeholder="e.g., 90"
                                    {...field}
                                    />
                                )}
                                />
                                {errors.ehsScore && (
                                <p className="text-sm text-destructive">
                                    {errors.ehsScore.message}
                                </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="schedule-score" className="text-sm">
                                Schedule Score (0-100)
                                </Label>
                                <Controller
                                name="scheduleScore"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                    id="schedule-score"
                                    type="number"
                                    placeholder="e.g., 80"
                                    {...field}
                                    />
                                )}
                                />
                                {errors.scheduleScore && (
                                <p className="text-sm text-destructive">
                                    {errors.scheduleScore.message}
                                </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="quality-score" className="text-sm">
                                Quality Score (0-100)
                                </Label>
                                <Controller
                                name="qualityScore"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                    id="quality-score"
                                    type="number"
                                    placeholder="e.g., 88"
                                    {...field}
                                    />
                                )}
                                />
                                {errors.qualityScore && (
                                <p className="text-sm text-destructive">
                                    {errors.qualityScore.message}
                                </p>
                                )}
                            </div>
                            <div className="space-y-2 lg:col-start-1">
                                <Label htmlFor="risk-score" className="text-sm">
                                Risk Score (0-100)
                                </Label>
                                <Controller
                                name="riskScore"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                    id="risk-score"
                                    type="number"
                                    placeholder="e.g., 75"
                                    {...field}
                                    />
                                )}
                                />
                                {errors.riskScore && (
                                <p className="text-sm text-destructive">
                                    {errors.riskScore.message}
                                </p>
                                )}
                            </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm">Final Score</Label>
                                <Input value={finalScore} readOnly />
                            </div>
                            <div className="space-y-2">
                            <Label htmlFor="evaluatorComments" className="text-sm">Comments</Label>
                            <Controller
                                name="evaluatorComments"
                                control={control}
                                render={({ field }) => (
                                <Textarea
                                    id="evaluatorComments"
                                    placeholder="Add your evaluation comments here."
                                    {...field}
                                />
                                )}
                            />
                            {errors.evaluatorComments && (
                                <p className="text-sm text-destructive">
                                {errors.evaluatorComments.message}
                                </p>
                            )}
                            </div>
                            <div className="flex justify-end gap-2">
                            <Button type="submit" disabled={isSubmitting} className="w-full">
                                {isSubmitting && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Submit Evaluation
                            </Button>
                            </div>
                        </form>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    )
}
