import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc, addDoc, Timestamp } from '@/lib/firestore-compat';
// signInWithCustomToken is dynamically imported in handleVerifyCode
import { db, auth } from '@/lib/firebase';
import { RFP, Supplier, RfpQuestion, Proposal } from '@/types';
import { Loader2, Send, FileText, MessageSquare, Upload, CheckCircle2, AlertCircle, Lock, ClipboardList, ChevronDown, ChevronUp, Building, Paperclip, Download, History as HistoryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { FileUpload } from '@/components/file-upload';
import { useCollection } from '@/lib/firebase-hooks-compat';
import { cn } from '@/lib/utils';
import { logAudit } from '@/lib/audit';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Inlined component to avoid import issues
function SupplierBrandingLogo({ logoUrl, name, className, iconClassName }: { logoUrl?: string | null; name: string; className?: string; iconClassName?: string }) {
  const [hasError, setHasError] = useState(false);

  if (logoUrl && !hasError) {
    return (
      <div className={cn("flex h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-muted", className)}>
        <img
          src={logoUrl}
          alt={name}
          className="aspect-square h-full w-full object-contain p-1"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted", className)}>
      <span className="text-[10px] font-bold text-muted-foreground">ICON</span>
    </div>
  );
}

// Helper component for showing historical proposal documents
function TableRowWithDocs({ proposal }: { proposal: Proposal }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
      <>
        <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <TableCell className="font-bold text-primary pl-4">
            #{proposal.revision ?? 0}
          </TableCell>
          <TableCell className="text-sm text-foreground/80 font-medium">
            {format(safeToDate(proposal.submittedAt), 'MMM d, yyyy h:mm a')}
          </TableCell>
          <TableCell className="text-right text-sm font-bold pr-4">
            <div className="flex items-center justify-end gap-3">
              <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(proposal.price)}</span>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </TableCell>
        </TableRow>
        <CollapsibleContent asChild>
          <TableRow className="bg-muted/10">
            <TableCell colSpan={3} className="px-6 py-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                   <Paperclip className="h-3.5 w-3.5 text-primary" />
                   <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Attached Documents</span>
                </div>
                {proposal.attachments && proposal.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {proposal.attachments.map((doc, i) => (
                      <a 
                        key={i} 
                        href={doc.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg border bg-background hover:border-primary/30 hover:bg-muted/30 transition-all group"
                      >
                        <div className="flex items-center gap-2 truncate">
                           <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                           <span className="text-xs truncate font-medium">{doc.name}</span>
                        </div>
                        <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No documents attached.</p>
                )}
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

const safeToDate = (date: any): Date => {
  if (!date) return new Date();
  if (typeof date.toDate === 'function') return date.toDate();
  if (date instanceof Date) return date;
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

interface PortalClientProps {
  rfpId: string;
  initialCode?: string;
}

export default function PortalClient({ rfpId, initialCode }: PortalClientProps) {
  const [rfp, setRfp] = useState<RFP | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [accessCode, setAccessCode] = useState(initialCode || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  // Q&A State
  const [newQuestion, setNewQuestion] = useState('');
  const [questionFiles, setQuestionFiles] = useState<{ name: string; url: string }[]>([]);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  // Proposal State
  const [proposalPrice, setProposalPrice] = useState('');
  const [proposalFiles, setProposalFiles] = useState<{ name: string; url: string }[]>([]);
  const [revisionNumber, setRevisionNumber] = useState<number>(0);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [hasSubmittedSuccessfully, setHasSubmittedSuccessfully] = useState(false);
  const [isSpecExpanded, setIsSpecExpanded] = useState(true);

  // Token refresh: re-verify before expiry (custom tokens last 1 hour)
  const TOKEN_REFRESH_MS = 50 * 60 * 1000; // Refresh at 50 minutes (10 min buffer)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleTokenRefresh = useCallback((code: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/portal/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rfpId, code }),
        });
        const data = await res.json();
        if (data.success) {
          const { signInWithCustomToken } = await import('firebase/auth');
          await signInWithCustomToken(auth, data.customToken);
          scheduleTokenRefresh(code); // Schedule next refresh
        }
      } catch (e) {
        console.error('Token refresh failed:', e);
      }
    }, TOKEN_REFRESH_MS);
  }, [rfpId]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (initialCode) {
      verifyCode(initialCode, () => cancelled);
    } else {
      setIsLoading(false);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const [isLockedOut, setIsLockedOut] = useState(false);

  const verifyCode = async (code: string, isCancelled: () => boolean) => {
    if (isLockedOut) {
      toast({ variant: 'destructive', title: 'Access Locked', description: 'Too many failed attempts. Please contact the procurement team.' });
      return;
    }
    setIsVerifying(true);
    try {
      // Server-side code verification via API route
      const res = await fetch('/api/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfpId, code }),
      });
      if (isCancelled()) return;
      const data = await res.json();

      if (!data.success) {
        if (isCancelled()) return;
        if (res.status === 429) {
          setIsLockedOut(true);
          toast({ variant: 'destructive', title: 'Access Locked', description: data.error });
        } else if (res.status === 403) {
          toast({ variant: 'destructive', title: 'Access Revoked', description: 'Your access to this portal has been revoked. Please contact the procurement team.' });
        } else {
          toast({ variant: 'destructive', title: 'Invalid Code', description: data.error || 'The access code is incorrect.' });
        }
        return;
      }

      // Sign in with the scoped custom token from the API
      const { signInWithCustomToken } = await import('firebase/auth');
      await signInWithCustomToken(auth, data.customToken);
      if (isCancelled()) return;

      // Fetch the full RFP and supplier data now that we're authenticated
      const rfpDoc = await getDoc(doc(db, 'rfps', rfpId));
      if (isCancelled()) return;
      if (rfpDoc.exists()) {
        setRfp({ id: rfpDoc.id, ...rfpDoc.data() } as RFP);
      }

      const supplierDoc = await getDoc(doc(db, 'suppliers', data.supplierId));
      if (isCancelled()) return;
      if (supplierDoc.exists()) {
        setSupplier({ id: supplierDoc.id, ...supplierDoc.data() } as Supplier);
      }

      setAccessCode(code);
      setIsAuthenticated(true);
      scheduleTokenRefresh(code);
    } catch (error) {
      if (isCancelled()) return;
      console.error('Portal Auth Error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to authenticate. Please ensure you have a stable connection.' });
    } finally {
      if (!isCancelled()) {
        setIsVerifying(false);
        setIsLoading(false);
      }
    }
  };

  // Public-facing handler for the form button (no cancellation needed)
  const handleVerifyCode = (code: string) => verifyCode(code, () => false);

  const [questionsValue] = useCollection(
    isAuthenticated ? query(collection(db, 'rfp_questions'), where('rfpId', '==', rfpId)) : null
  );

  const questions = useMemo(() => {
    if (!questionsValue || !supplier) return [];
    return questionsValue.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as RfpQuestion))
      .filter(q => q.isPublic || q.supplierId === supplier.id)
      .sort((a, b) => {
         const dateA = safeToDate(a.createdAt);
         const dateB = safeToDate(b.createdAt);
         return dateB.getTime() - dateA.getTime();
      });
  }, [questionsValue, supplier]);

  const [proposalsValue] = useCollection(
    isAuthenticated && supplier ? query(collection(db, 'proposals'), where('rfpId', '==', rfpId), where('supplierId', '==', supplier.id)) : null
  );

  const pastProposals = useMemo(() => {
    if (!proposalsValue) return [];
    return proposalsValue.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Proposal))
      .sort((a, b) => safeToDate(b.submittedAt).getTime() - safeToDate(a.submittedAt).getTime());
  }, [proposalsValue]);

  const defaultRevision = useMemo(() => {
    if (pastProposals.length === 0) return 0;
    const maxRev = Math.max(...pastProposals.map(p => p.revision ?? -1));
    return maxRev + 1;
  }, [pastProposals]);

  useEffect(() => {
    if (defaultRevision >= 0 && pastProposals.length > 0) {
      setRevisionNumber(defaultRevision);
    }
  }, [defaultRevision, pastProposals.length]);

  const handleSubmitQuestion = async () => {
    if (!newQuestion.trim() || !supplier) return;
    setIsSubmittingQuestion(true);
    try {
      const docRef = await addDoc(collection(db, 'rfp_questions'), {
        rfpId,
        clientId: rfp?.clientId ?? '',
        supplierId: supplier.id,
        supplierName: supplier.companyName,
        question: newQuestion,
        questionAttachments: questionFiles,
        createdAt: new Date(),
        isPublic: false
      });
      logAudit({ action: 'portal.question_asked', category: 'portal', targetCollection: 'rfp_questions', targetDocId: docRef.id, clientId: rfp?.clientId, details: { rfpTitle: rfp?.title, supplierName: supplier?.companyName } });
      setNewQuestion('');
      setQuestionFiles([]);
      toast({ title: 'Success', description: 'Question submitted. We will notify you once answered.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit question.' });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleSubmitProposal = async () => {
    if (!supplier) return;
    setIsSubmittingProposal(true);
    try {
      const docRef = await addDoc(collection(db, 'proposals'), {
        rfpId,
        clientId: rfp?.clientId ?? '',
        supplierId: supplier.id,
        supplierName: supplier.companyName,
        status: 'submitted',
        revision: revisionNumber,
        submittedAt: new Date(),
        price: parseFloat(proposalPrice) || 0,
        attachments: proposalFiles,
        technicalScore: 0,
        commercialScore: 0,
        finalScore: 0,
        aiSummary: '',
        evaluatorComments: ''
      });
      logAudit({ action: 'portal.proposal_submitted', category: 'portal', targetCollection: 'proposals', targetDocId: docRef.id, clientId: rfp?.clientId, details: { rfpTitle: rfp?.title, supplierName: supplier?.companyName, revision: revisionNumber } });
      // Show success toast
      toast({
        title: "Proposal Submitted",
        description: `Revision #${revisionNumber} has been successfully recorded.`,
      });

      // Reset local state to allow new submission
      setProposalPrice('');
      setProposalFiles([]);
      // revisionNumber will be updated via defaultRevision memo and useEffect
      
    } catch (error: any) {
      // Detect expired token and attempt re-auth
      if (error?.code === 'permission-denied' || error?.code === 'unauthenticated') {
        try {
          if (accessCode) {
            const res = await fetch('/api/portal/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rfpId, code: accessCode }),
            });
            const data = await res.json();
            if (data.success) {
              const { signInWithCustomToken } = await import('firebase/auth');
              await signInWithCustomToken(auth, data.customToken);
              scheduleTokenRefresh(accessCode);
              toast({ title: 'Session Renewed', description: 'Please try submitting again.' });
              return;
            }
          }
        } catch { /* fallthrough to generic error */ }
      }
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit proposal. Please refresh and try again.' });
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary/20" />
          <span className="text-foreground/40 text-xs font-bold uppercase tracking-[0.2em]">Establishing Secure Connection</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
        {/* Professional Mesh Gradient */}
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary rounded-full blur-[150px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-900 rounded-full blur-[150px]" />
        </div>
        
        <div className="w-full max-w-lg px-6 relative z-10">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-8">
              <div className="h-12 w-12 bg-sidebar-background rounded-xl flex items-center justify-center shadow-2xl">
                <Lock className="h-6 w-6 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight mb-3">Supplier Portal</h1>
            <p className="text-muted-foreground font-medium">Please enter your unique access code to continue</p>
          </div>
          
          <Card className="border-border bg-card/50 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
            <CardContent className="p-8 sm:p-10 space-y-8">
              {isLockedOut ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-destructive" />
                  </div>
                  <p className="text-sm font-bold text-destructive">Access Locked</p>
                  <p className="text-xs text-muted-foreground">Too many failed attempts. Please contact the procurement team to have your access re-issued.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <Label htmlFor="code" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Verification Code</Label>
                    <div className="relative">
                      <Input
                        id="code"
                        placeholder="ENTER CODE"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                        className="h-14 bg-background border-border text-foreground font-mono tracking-widest text-center text-xl uppercase focus:ring-primary/20 focus:border-primary/30 rounded-2xl transition-all placeholder:text-muted-foreground/20"
                        disabled={isLockedOut}
                      />
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full h-14 text-sm font-bold rounded-2xl bg-sidebar-background hover:bg-sidebar-accent text-white border-none shadow-xl transition-all active:scale-[0.98]" 
                    onClick={() => handleVerifyCode(accessCode)}
                    disabled={isVerifying || !accessCode || isLockedOut}
                  >
                    {isVerifying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Enter Portal'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          
          <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            <CheckCircle2 className="h-3 w-3" /> Encrypted Endpoint
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/30">
      {/* Professional Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 group cursor-default">
              <div className="h-8 w-8 bg-sidebar-background rounded-lg flex items-center justify-center shadow-md">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground uppercase">Procure<span className="text-primary italic font-black">Flow</span></span>
            </div>
            <div className="hidden lg:flex items-center gap-4 border-l pl-4 border-border">
               <div className="flex flex-col">
                 <span className="text-sm font-semibold truncate max-w-[250px] leading-tight">{rfp?.title}</span>
                 <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1.2 uppercase font-bold border-primary/20 text-primary bg-primary/5 leading-none">
                      {rfp?.status}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight flex items-center gap-1">
                      <Lock className="h-2.5 w-2.5" /> {rfpId.substring(0, 8)} 
                    </span>
                 </div>
               </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:flex flex-col items-end">
              <p className="text-sm font-bold leading-tight text-foreground tracking-tight">{supplier?.companyName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Authorized</span>
              </div>
            </div>
            <SupplierBrandingLogo 
              logoUrl={supplier?.logoUrl} 
              name={supplier?.companyName || ''} 
              className="h-10 w-10 rounded-lg border border-border shadow-sm bg-white p-1"
              iconClassName="h-4 w-4"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-10 max-w-7xl space-y-8">
        {/* Top Section: Shared Resources */}
        {rfp?.attachedFiles && rfp.attachedFiles.length > 0 && (
          <div className="bg-card shadow-sm rounded-2xl p-6 border border-border animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-4">
              <Paperclip className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Project Resources & Specifications</h3>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {rfp.attachedFiles.map((file, idx) => (
                <a 
                  key={idx} 
                  href={file.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 pr-4 rounded-xl bg-background hover:bg-accent transition-all border border-border group min-w-[200px] max-w-[280px] shadow-sm active:scale-[0.98]"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate text-foreground/90 transition-colors">{file.name}</span>
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight">Resource</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: RFP Info & Stats */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-card shadow-sm rounded-2xl p-6 border border-border relative overflow-hidden group">
               <div className="relative space-y-6">
                 <div>
                  <Collapsible
                    open={isSpecExpanded}
                    onOpenChange={setIsSpecExpanded}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" /> Project Summary
                      </h3>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-md hover:bg-primary/5">
                          {isSpecExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-primary" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="animate-in fade-in slide-in-from-top-1">
                      <p className="text-xs leading-relaxed text-muted-foreground font-medium">
                        {rfp?.description}
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                 </div>
                 
                 <div className="space-y-3 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deadline</span>
                      <span className="text-xs font-bold text-foreground">
                        {rfp ? format(safeToDate(rfp.closeDate), 'MMM d, yyyy') : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Location</span>
                      <span className="text-xs font-bold text-foreground">
                        {rfp?.cityName}, {rfp?.stateCode}
                      </span>
                    </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interaction Hub */}
          <div className="lg:col-span-9">
            <Tabs defaultValue="proposal" className="w-full">
              <TabsList className="bg-muted/50 p-1 rounded-xl mb-6 border w-fit">
                <TabsTrigger value="proposal" className="px-6 rounded-lg font-bold text-[11px] uppercase tracking-wider h-9">
                  Proposal Submission
                </TabsTrigger>
                <TabsTrigger value="qa" className="px-6 rounded-lg font-bold text-[11px] uppercase tracking-wider h-9">
                  Q&A Support
                </TabsTrigger>
              </TabsList>

              <TabsContent value="proposal" className="space-y-6 outline-none animate-in fade-in duration-300">
                <div className="bg-card shadow-sm rounded-2xl p-8 border border-border space-y-10">
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <HistoryIcon className="h-4 w-4 text-primary" />
                         <h2 className="text-base font-bold text-foreground">Submission History</h2>
                      </div>
                      <Badge variant="outline" className="text-[9px] h-4 font-bold border-muted-foreground/20">
                        {pastProposals.length} {pastProposals.length === 1 ? 'Submission' : 'Submissions'}
                      </Badge>
                    </div>
                    
                    <div className="rounded-xl border border-border overflow-hidden bg-background">
                      {pastProposals.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent bg-muted/30">
                              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground w-16 pl-4">Rev.</TableHead>
                              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground">Date Submitted</TableHead>
                              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground text-right pr-4">Total Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pastProposals.map((p) => (
                              <TableRowWithDocs key={p.id} proposal={p} />
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="py-12 text-center flex flex-col items-center gap-2">
                           <FileText className="h-8 w-8 text-muted-foreground/20" />
                           <p className="text-xs text-muted-foreground font-medium italic">No submissions have been recorded yet.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-8 border-t border-border/50">
                    <div className="mb-6">
                       <h2 className="text-base font-bold text-foreground mb-1">New Proposal Submission</h2>
                       <p className="text-xs text-muted-foreground font-medium">Define your commercial terms and provide necessary documentation.</p>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="revision" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Revision Number</Label>
                          <Input
                            id="revision"
                            type="number"
                            min="0"
                            value={revisionNumber}
                            onChange={(e) => setRevisionNumber(parseInt(e.target.value) || 0)}
                            className="h-11 bg-background border-border rounded-xl text-sm font-bold text-foreground focus-visible:ring-primary/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="price" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Bid Price (USD)</Label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground/50">$</span>
                            <Input
                              id="price"
                              type="number"
                              placeholder="0.00"
                              value={proposalPrice}
                              onChange={(e) => setProposalPrice(e.target.value)}
                              className="pl-7 h-11 bg-background border-border rounded-xl text-sm font-bold text-foreground placeholder-muted-foreground/20 focus-visible:ring-primary/20"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {proposalPrice && !isNaN(parseFloat(proposalPrice)) && (
                        <div className="px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between text-xs animate-in fade-in">
                          <span className="font-bold text-muted-foreground">Formatted Amount</span>
                          <span className="font-black text-primary">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(proposalPrice))}
                          </span>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Technical Documentation</Label>
                        <div className="bg-background rounded-xl p-6 border border-dashed border-border hover:border-primary/30 transition-all">
                          <FileUpload
                            value={proposalFiles}
                            onChange={setProposalFiles}
                            folder={`rfps/${rfpId}/proposals/${supplier?.id}`}
                          />
                        </div>
                      </div>

                      <div className="bg-muted/50 p-4 rounded-xl flex items-start gap-3">
                         <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                         <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                           By submitting, you confirm that all commercial terms are final and include all applicable taxes and logistics for the specified location.
                         </p>
                      </div>

                      <Button 
                        className="w-full h-12 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/10 transition-all active:scale-[0.99] uppercase tracking-widest"
                        onClick={handleSubmitProposal}
                        disabled={isSubmittingProposal || !proposalPrice || proposalFiles.length === 0}
                      >
                        {isSubmittingProposal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm & Submit Proposal'}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="qa" className="space-y-6 outline-none animate-in fade-in duration-300">
                <div className="bg-card shadow-sm rounded-2xl p-8 border border-border">
                  <div className="flex items-center gap-3 mb-6">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <div>
                      <h2 className="text-base font-bold text-foreground">Clarification Support</h2>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Private messaging with procurement</p>
                    </div>
                  </div>
                  
                  <div className="space-y-5">
                    <Textarea 
                      placeholder="Submit your question regarding technical scope or requirements..." 
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      className="min-h-[120px] bg-background border-border rounded-xl text-sm font-medium p-4 focus-visible:ring-primary/20 placeholder:text-muted-foreground/40 text-foreground"
                    />
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Attachments (Optional)</Label>
                      <FileUpload
                        value={questionFiles}
                        onChange={setQuestionFiles}
                        folder={`rfps/${rfpId}/questions/${supplier?.id}`}
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button 
                        className="bg-primary text-white hover:bg-primary/90 rounded-xl font-bold px-8 h-11 transition-all"
                        onClick={handleSubmitQuestion} 
                        disabled={isSubmittingQuestion || !newQuestion.trim()}
                      >
                        {isSubmittingQuestion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Send Question'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {questions.length === 0 ? (
                    <div className="py-16 text-center bg-card/50 shadow-sm rounded-3xl border border-dashed border-white/5 opacity-40">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">No active communications</p>
                    </div>
                  ) : (
                    <div className="bg-card/50 shadow-sm rounded-3xl border border-white/5 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-white/5">
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground pl-8 h-12">Question</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground h-12">Date</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground h-12">Status</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground pr-8 h-12">Answer</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {questions.map((q) => (
                            <TableRow key={q.id} className="hover:bg-white/[0.02] border-white/5 group">
                              <TableCell className="py-6 pl-8">
                                <p className="text-sm font-bold text-foreground leading-relaxed transition-colors group-hover:text-primary">
                                  {q.question}
                                </p>
                                {q.questionAttachments && q.questionAttachments.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {q.questionAttachments.map((file, i) => (
                                      <a
                                        key={i}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border text-[10px] font-medium hover:bg-muted transition-colors"
                                      >
                                        <FileText className="h-3 w-3 text-primary" />
                                        <span className="truncate max-w-[120px]">{file.name}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-1 flex items-center gap-2">
                                  {q.supplierId === supplier?.id ? (
                                    <Badge variant="outline" className="text-[8px] h-3.5 px-1.5 uppercase font-bold border-primary/30 text-primary bg-primary/5">
                                      Your Question
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[8px] h-3.5 px-1.5 uppercase font-bold">
                                      Public
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider tabular-nums">
                                {format(safeToDate(q.createdAt), 'MMM d, h:mm a')}
                              </TableCell>
                              <TableCell>
                                {q.answer ? (
                                  <Badge variant="default" className="bg-green-500/10 text-green-500 dark:text-green-400 border-none text-[8px] font-black uppercase tracking-widest h-5 px-2">
                                    Resolved
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400 border-none text-[8px] font-black uppercase tracking-widest h-5 px-2">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-6 pr-8">
                                {q.answer ? (
                                  <div className="space-y-1">
                                    <span className="text-[8px] uppercase font-bold tracking-widest text-primary flex items-center gap-1">
                                      <CheckCircle2 className="h-2.5 w-2.5" /> Official Response
                                    </span>
                                    <p className="text-sm font-medium text-muted-foreground leading-relaxed max-w-md">
                                      {q.answer}
                                    </p>
                                    {q.answerAttachments && q.answerAttachments.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {q.answerAttachments.map((file, i) => (
                                          <a
                                            key={i}
                                            href={file.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/5 border border-primary/10 text-[10px] font-medium hover:bg-primary/10 transition-colors"
                                          >
                                            <FileText className="h-3 w-3 text-primary" />
                                            <span className="truncate max-w-[120px] text-primary">{file.name}</span>
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic font-medium">Under review by procurement...</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      <footer className="py-10 border-t border-white/5 mt-auto">
        <div className="container mx-auto px-6 text-center max-w-7xl">
           <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em]">
             &copy; 2026 ProcureFlow Global • Mission Critical Sourcing
           </p>
        </div>
      </footer>
    </div>
  );
}
