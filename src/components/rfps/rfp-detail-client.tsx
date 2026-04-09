import React, { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Loader2, 
  Mail, 
  Award, 
  FileText, 
  ListChecks, 
  Bot, 
  Send, 
  FileUp, 
  UserCheck, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  ChevronsUpDown, 
  CheckCircle2, 
  Eye, 
  ArrowLeft, 
  Save, 
  ClipboardCopy, 
  Mailbox, 
  MessageSquare, 
  ClipboardList, 
  Edit, 
  DollarSign, 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  Lock, 
  Paperclip,
  Plus,
  Download,
  Sparkles,
  FileSpreadsheet,
  Briefcase,
  Clock,
  User,
  Phone,
  History,
  X,
  AlertCircle,
  ExternalLink,
  FolderOpen
} from 'lucide-react';
import { useCollection, useDocument } from '@/lib/firebase-hooks-compat';
import { collection, query, where, doc, updateDoc, getDocs, limit, getDoc, Timestamp, addDoc, serverTimestamp, deleteDoc } from '@/lib/firestore-compat';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, getMetadata, getBlob } from '@/lib/file-storage';
import * as docx from 'docx';
import { db, storage } from '@/lib/firebase';
import type { Proposal, Supplier, RfpTemplate as RfpTemplateType, RfpFlowType, RFP, RfpadvancedStages, Client, RfpQuestion } from '@/types';
import { format, differenceInDays, parseISO } from 'date-fns';
import { FileUpload } from '@/components/file-upload';
import { runAnalysis, RunAnalysisOutput } from '@/ai/flows/run-analysis';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { logAudit } from '@/lib/audit';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { cn, ensureDate, ensureIsoString } from '@/lib/utils';
import PizZip from 'pizzip';
import { NotesButton } from '@/components/notes/notes-button';
import Docxtemplater from 'docxtemplater';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip as ChartTooltip, 
  Layer, 
  Rectangle, 
  Cell, 
  ReferenceLine,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LabelList
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { SupplierPrequalificationSection } from '../supplier-prequalification-section';
import { RfpPrepStage } from './rfp-prep-stage';
import { BidStage } from './bid-stage';
import { BidAnalysisStage } from './bid-analysis-stage';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { SupplierBrandingLogo as CompanyLogo } from './company-logo';
import { fillEmailPlaceholders } from '@/ai/flows/fill-email-placeholders';

// Deserialized RFP type for client-side usage
interface ClientRFP extends Omit<RFP, 'openDate' | 'closeDate' | 'createdAt' | 'executionStartDate' | 'executionEndDate' | 'eoiDeadline'> {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'closed';
  flowType: RfpFlowType;
  openDate: string; // ISO string
  closeDate: string; // ISO string
  createdBy: string; // User ID
  attachedFiles: { 
    name: string; 
    url: string; 
    id?: string;
    uploadedAt?: string;
    versions?: { name: string; url: string; uploadedAt: string }[];
  }[];
  createdAt: string; // ISO string
  selectedSupplierIds?: string[];
  supplierAccessCodes?: Record<string, string>;
  blockedSupplierIds?: string[];
  completedStages?: string[];
  aiAnalysisSummary?: string;
  aiScheduleData?: RunAnalysisOutput['scheduleData'];
  aiAnalysisSections?: Record<string, string>;
  advancedStages?: RfpadvancedStages;
  executionStartDate?: string;
  executionEndDate?: string;
  eoiDeadline?: string;
  procurementContact?: {
    name: string;
    email: string;
    role: string;
    phone: string;
  };
}

const SIMPLE_TABS = ['registry', 'selection', 'eoi', 'documents', 'invitation', 'questions', 'proposals', 'analysis', 'award'];
const advanced_TABS = [
  "procurement-strategy",
  "procurement-plan-methodology",
  "prequalification",
  "rfp-preparation",
  "bid",
  "questions",
  "initial-bid-analysis",
  "technical-cdes",
  "negotiations",
  "bafo-analysis",
  "award-recommendation",
  "debriefs",
];

const SIMPLE_TABS_CONFIG: { [key: string]: { label: string; icon: React.ElementType } } = {
  'registry': { label: 'Registry', icon: ClipboardList },
  'selection': { label: 'Selection', icon: ListChecks },
  'eoi': { label: 'EOI', icon: Mail },
  'documents': { label: 'Documents', icon: FileText },
  'invitation': { label: 'Invitation', icon: Send },
  'questions': { label: 'Q&A', icon: MessageSquare },
  'proposals': { label: 'Proposals', icon: FileUp },
  'analysis': { label: 'Analysis', icon: Bot },
  'award': { label: 'Award', icon: Award }
};

const advanced_TABS_CONFIG: { [key: string]: { label: string } } = {
    "procurement-strategy": { label: "Strategy" },
    "procurement-plan-methodology": { label: "Plan" },
    "prequalification": { label: "Prequal." },
    "rfp-preparation": { label: "RFP Prep" },
    "bid": { label: "BID" },
    "questions": { label: "Q&A" },
    "initial-bid-analysis": { label: "Bid Analysis" },
    "technical-cdes": { label: "CDEs" },
    "negotiations": { label: "Negotiations" },
    "bafo-analysis": { label: "BAFO" },
    "award-recommendation": { label: "Award" },
    "debriefs": { label: "Debriefs" },
};


export const StageCompletion = ({ stage, rfp, onUpdate, children }: { stage: string; rfp: ClientRFP, onUpdate: (stages: string[], isCompleting: boolean) => void, children?: React.ReactNode }) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const isComplete = rfp.completedStages?.includes(stage) || false;

  const handleToggleComplete = () => {
    if (isSaving) return;
    setIsSaving(true);
    const rfpRef = doc(db, 'rfps', rfp.id);
    
    const currentStages = rfp.completedStages || [];
    const isCompleting = !isComplete;
    const newStages = isCompleting
      ? [...currentStages, stage]
      : currentStages.filter(s => s !== stage);

    const updateData = { completedStages: newStages };

    updateDoc(rfpRef, updateData)
      .then(() => {
        toast({
          title: 'Success',
          description: `Stage '${stage}' marked as ${isCompleting ? 'complete' : 'incomplete'}.`,
        });
        onUpdate(newStages, isCompleting);
      })
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
          path: rfpRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to update stage completion.',
        });
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  return (
    <CardFooter className='justify-between p-4'>
      <div
        onClick={handleToggleComplete}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'cursor-pointer',
          isSaving ? 'cursor-not-allowed opacity-50' : ''
        )}
      >
        <Checkbox checked={isComplete} className="mr-2" disabled={isSaving} />
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Mark as complete
      </div>
       {children}
    </CardFooter>
  );
};


// Placeholder Components for each tab
const SelectionTab = ({ rfp, onSelectionSave, onSaveSuccess, onStageUpdate }: { rfp: ClientRFP; onSelectionSave: (ids: string[]) => void; onSaveSuccess: () => void; onStageUpdate: (stages: string[], isCompleting: boolean) => void; }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suppliersValue, suppliersLoading, suppliersError] = useCollection(
    user ? collection(db, 'suppliers') : undefined
  );

  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>(rfp.selectedSupplierIds || []);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (suppliersError) {
      const permissionError = new FirestorePermissionError({
        path: 'suppliers',
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  }, [suppliersError]);

  const handleSelectSupplier = (supplierId: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(supplierId)
        ? prev.filter((id) => id !== supplierId)
        : [...prev, supplierId]
    );
  };

  const handleSaveSelection = () => {
    setIsSaving(true);
    const rfpRef = doc(db, 'rfps', rfp.id);
    const updateData = { selectedSupplierIds: selectedSuppliers };

    updateDoc(rfpRef, updateData)
      .then(() => {
        logAudit({ action: 'rfp.suppliers_selected', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, clientId: rfp.clientId, details: { supplierNames: selectedSuppliers.map(id => allSuppliers.find(s => s.id === id)?.companyName || id), rfpTitle: rfp.title } });
        toast({ title: 'Success', description: 'Supplier selection has been saved.' });
        onSelectionSave(selectedSuppliers);
        onSaveSuccess();
      })
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
          path: rfpRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to save selection.',
        });
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const allSuppliers: Supplier[] =
    suppliersValue?.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Supplier)
    ) || [];

  const filtered = searchQuery.trim()
    ? allSuppliers.filter(s =>
        s.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (Array.isArray(s.contacts) && s.contacts[0]?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allSuppliers;

  if (suppliersLoading) {
    return <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />;
  }

  if (suppliersError) {
    return (
      <div className="text-destructive text-center">
        Error loading suppliers. You may not have permission to view them.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Supplier Selection</CardTitle>
        <CardDescription>
          Select which suppliers will be invited to participate in this RFP.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Input
            placeholder="Search suppliers by name or contact..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Invite</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact Name</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedSuppliers.includes(supplier.id)}
                      onCheckedChange={() => handleSelectSupplier(supplier.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CompanyLogo logoUrl={supplier.logoUrl} name={supplier.companyName} className="h-6 w-6" iconClassName="h-3 w-3" />
                      <span>{supplier.companyName}</span>
                    </div>
                  </TableCell>
                  <TableCell>{Array.isArray(supplier.contacts) ? supplier.contacts[0]?.name : '—'}</TableCell>
                  <TableCell>{Array.isArray(supplier.contacts) ? supplier.contacts[0]?.email : '—'}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    No suppliers found matching your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Button className="mt-4" onClick={handleSaveSelection} disabled={isSaving}>
           {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Selection
        </Button>
      </CardContent>
      <StageCompletion stage="selection" rfp={rfp} onUpdate={onStageUpdate} />
    </Card>
  );
};

type TemplateContext = {
    supplierContactName: string;
    supplierLegalName: string;
    supplierEmail: string;
    projectName: string;
    packageName: string;
    projectLocation?: string;
    clientName?: string;
    rfpReferenceId?: string;
    portalLink?: string;
    accessCode?: string;
};

const EoiTab = ({ rfp, onStageUpdate, onSendEoiClick }: { rfp: ClientRFP, onStageUpdate: (stages: string[], isCompleting: boolean) => void; onSendEoiClick: (supplier: Supplier) => void }) => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSuppliers = async () => {
            if (!rfp.selectedSupplierIds || rfp.selectedSupplierIds.length === 0) {
                setLoading(false);
                return;
            }

            try {
                const suppliersQuery = query(collection(db, 'suppliers'), where('__name__', 'in', rfp.selectedSupplierIds));
                const querySnapshot = await getDocs(suppliersQuery);
                const fetchedSuppliers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
                setSuppliers(fetchedSuppliers);
            } catch (e: any) {
                setError(e.message);
                const permissionError = new FirestorePermissionError({ path: 'suppliers', operation: 'list' });
                errorEmitter.emit('permission-error', permissionError);
            } finally {
                setLoading(false);
            }
        };

        fetchSuppliers();
    }, [rfp.selectedSupplierIds]);

    if (loading) {
        return <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />;
    }

    if (error) {
        return <div className="text-destructive text-center">Error loading selected suppliers: {error}</div>;
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Expression of Interest (EOI)</CardTitle>
                <CardDescription>
                    Review the selected suppliers and send an EOI to gauge their interest.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {suppliers.length > 0 ? (
                    <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Company Name</TableHead>
                                <TableHead>Contact Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {suppliers.map(supplier => (
                                <TableRow key={supplier.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <CompanyLogo logoUrl={supplier.logoUrl} name={supplier.companyName} className="h-6 w-6" iconClassName="h-3 w-3" />
                                            <span>{supplier.companyName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{Array.isArray(supplier.contacts) ? supplier.contacts[0]?.name : '—'}</TableCell>
                                    <TableCell>{Array.isArray(supplier.contacts) ? supplier.contacts[0]?.email : '—'}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => onSendEoiClick(supplier)}>
                                            <Mail className="mr-2 h-4 w-4" />
                                            Send EOI
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <UserCheck className="mx-auto h-12 w-12" />
                        <p className="mt-4">No suppliers have been selected for this RFP yet.</p>
                        <p className="text-sm">Go to the &quot;Selection&quot; tab to choose suppliers.</p>
                    </div>
                )}
            </CardContent>
             <StageCompletion stage="eoi" rfp={rfp} onUpdate={onStageUpdate} />
        </Card>
    );
};

const GenerateDocumentDialog = ({ 
  rfp, 
  onDocumentGenerated 
}: { 
  rfp: ClientRFP, 
  onDocumentGenerated: (file: any) => void 
}) => {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<RfpTemplateType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();

  const [step, setStep] = useState<'select' | 'review'>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<RfpTemplateType | null>(null);
  const [reviewData, setReviewData] = useState<Record<string, string>>({});
  const [foundPlaceholders, setFoundPlaceholders] = useState<string[]>([]);
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);

  // Helper to map template placeholders to RFP data
  const autoMapValue = (placeholder: string): string => {
    const p = placeholder.toLowerCase().replace(/[^a-z0-9]/g, '');
    const data: Record<string, any> = {
      title: rfp.title,
      projecttitle: rfp.title,
      projectname: rfp.title,
      description: rfp.description,
      projectdescription: rfp.description,
      budget: rfp.budget?.toLocaleString(),
      totalbudget: rfp.budget?.toLocaleString(),
      opendate: rfp.openDate ? new Date(rfp.openDate).toLocaleDateString() : '',
      closedate: rfp.closeDate ? new Date(rfp.closeDate).toLocaleDateString() : '',
      deadline: rfp.closeDate ? new Date(rfp.closeDate).toLocaleDateString() : '',
      contactname: rfp.procurementContact?.name,
      contactperson: rfp.procurementContact?.name,
      contactemail: rfp.procurementContact?.email,
      executionstart: rfp.executionStartDate ? new Date(rfp.executionStartDate).toLocaleDateString() : '',
      startdate: rfp.executionStartDate ? new Date(rfp.executionStartDate).toLocaleDateString() : '',
      executionend: rfp.executionEndDate ? new Date(rfp.executionEndDate).toLocaleDateString() : '',
      enddate: rfp.executionEndDate ? new Date(rfp.executionEndDate).toLocaleDateString() : '',
      eoideadline: rfp.eoiDeadline ? new Date(rfp.eoiDeadline).toLocaleDateString() : '',
      country: rfp.countryCode,
      state: rfp.stateCode,
      region: rfp.stateCode,
      city: rfp.cityName,
      reference: rfp.id.substring(0, 8).toUpperCase(),
      refid: rfp.id.substring(0, 8).toUpperCase(),
      projectid: rfp.id.substring(0, 8).toUpperCase(),
    };
    
    // Exact match or fuzzy match
    if (data[p]) return data[p];
    
    // Check if placeholder contains any of the keys
    for (const [key, val] of Object.entries(data)) {
      if (p.includes(key) || key.includes(p)) return val || '';
    }
    
    return '';
  };

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'emailTemplates'), where('type', '==', 'document'));
      const qs = await getDocs(q);
      setTemplates(qs.docs.map(d => ({ id: d.id, ...d.data() } as RfpTemplateType)));
    } catch (e) {
      console.error('Error fetching templates:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) { fetchTemplates(); setStep('select'); setSelectedTemplate(null); setTemplateBlob(null); }
  }, [open]);

  const handleSelectTemplate = async (template: RfpTemplateType) => {
    if (!template.fileUrl) return;
    setSelectedTemplate(template);
    setIsScanning(true);
    try {
      // 1. Download the template
      const templateRef = ref(storage, template.fileUrl);
      const blob = await getBlob(templateRef);
      setTemplateBlob(blob);
      const arrayBuffer = await blob.arrayBuffer();
      
      const placeholders = new Set<string>();
      
      if (template.fileType === 'docx') {
        const zip = new PizZip(arrayBuffer);
        // Scan word/document.xml and potentially headers/footers
        const xmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.xml'));
        xmlFiles.forEach(fileName => {
          const content = zip.files[fileName].asText();
          const matches = content.matchAll(/\[(.*?)\]/g);
          for (const match of matches) {
            if (match[1] && match[1].length < 50) placeholders.add(match[1]);
          }
        });
      } else {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
          for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cell = worksheet[XLSX.utils.encode_cell({ c: C, r: R })];
              if (cell && cell.t === 's') {
                const matches = (cell.v as string).matchAll(/\[(.*?)\]/g);
                for (const match of matches) {
                  if (match[1] && match[1].length < 50) placeholders.add(match[1]);
                }
              }
            }
          }
        });
      }
      
      const found = Array.from(placeholders);
      const initialData: Record<string, string> = {};
      found.forEach(p => {
        initialData[p] = autoMapValue(p);
      });
      
      setFoundPlaceholders(found);
      setReviewData(initialData);
      setStep('review');
    } catch (e: any) {
      console.error('Error scanning template:', e);
      toast({ variant: 'destructive', title: 'Scan Failed', description: 'Could not identify placeholders in template.' });
    } finally {
      setIsScanning(false);
    }
  };

  const updateReviewField = (key: string, value: string) => {
    setReviewData(prev => ({ ...prev, [key]: value }));
  };

  const generateDocument = async () => {
    if (!selectedTemplate || !templateBlob) return;
    setIsGenerating(true);
    try {
      const arrayBuffer = await templateBlob.arrayBuffer();
      const finalData: Record<string, string> = {};
      Object.entries(reviewData).forEach(([k, v]) => {
        finalData[k] = v || 'N/A';
      });

      let generatedBlob: Blob;
      const baseName = selectedTemplate.name;
      const rfpPart = (reviewData['Title'] || reviewData['ProjectName'] || rfp.title).replace(/\s+/g, '_');
      let fileName = `${baseName}_${rfpPart}`;

      if (selectedTemplate.fileType === 'docx') {
        const zip = new PizZip(arrayBuffer);
        const docTemplate = new Docxtemplater(zip, { 
          paragraphLoop: true, 
          linebreaks: true,
          delimiters: { start: '[', end: ']' } // CRITICAL: Use [ ] as delimiters
        });
        docTemplate.render(finalData);
        generatedBlob = docTemplate.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        fileName += '.docx';
      } else {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
          for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
              const cell = worksheet[cell_ref];
              if (cell && cell.t === 's') {
                let val = cell.v as string;
                Object.entries(finalData).forEach(([key, sub]) => {
                  val = val.replace(new RegExp(`\\[${key}\\]`, 'g'), sub);
                });
                cell.v = val;
              }
            }
          }
        });
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        generatedBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        fileName += '.xlsx';
      }

      const storageRef = ref(storage, `rfps/${rfp.id}/generated/${Date.now()}_${fileName}`);
      const uploadResult = await uploadBytesResumable(storageRef, generatedBlob);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      onDocumentGenerated({
        id: Math.random().toString(36).substr(2, 9),
        name: fileName,
        url: downloadURL,
        uploadedAt: new Date().toISOString(),
        versions: []
      });
      setOpen(false);
      toast({ title: 'Success', description: `Document "${fileName}" generated successfully.` });
    } catch (e: any) {
      console.error('Error generating document:', e);
      toast({ variant: 'destructive', title: 'Generation Failed', description: e.message || 'Error occurred during generation.' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isAdmin && (
        <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          Create document
        </Button>
      )}
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        {step === 'select' ? (
          <>
            <DialogHeader>
              <DialogTitle>Generate Document from Template</DialogTitle>
              <DialogDescription>
                Select a template. We&apos;ll scan it for placeholders like [ProjectName] so you can review the data.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 overflow-y-auto flex-1">
              {isLoading || isScanning ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{isScanning ? 'Scanning template for placeholders...' : 'Loading templates...'}</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground italic">
                  No document templates found.<br />Add templates in the Dashboard to use this feature.
                </div>
              ) : (
                <div className="grid gap-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group cursor-pointer"
                      onClick={() => !isScanning && handleSelectTemplate(template)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-primary/10 text-primary">
                          {template.fileType === 'xlsx' ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{template.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{template.category} • {template.fileType}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={isScanning}>Cancel</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button onClick={() => setStep('select')} className="text-muted-foreground hover:text-foreground transition-colors mr-2">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                Complete Information
              </DialogTitle>
              <DialogDescription>
                We found {foundPlaceholders.length} placeholders in <strong>{selectedTemplate?.name}</strong>. Please confirm the values below.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto py-4 space-y-4 max-h-[55vh] pr-2 mt-2 border-t">
              {foundPlaceholders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No placeholders found in this template.<br/>Make sure your placeholders are in the [FieldName] format.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {foundPlaceholders.map((key) => {
                    const value = reviewData[key];
                    const isMissing = !value || value === 'N/A';
                    return (
                      <div key={key} className={cn("space-y-1.5 p-3 rounded-lg border bg-muted/20 transition-colors", isMissing && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm")}>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                            {key}
                            {isMissing && <Badge variant="outline" className="h-4 text-[9px] border-amber-500 text-amber-600 bg-amber-100 flex items-center gap-1">⚠️ Missing</Badge>}
                          </Label>
                        </div>
                        {key.toLowerCase().includes('description') || key.toLowerCase().includes('body') || key.toLowerCase().includes('scope') ? (
                          <Textarea
                            value={value}
                            onChange={e => updateReviewField(key, e.target.value)}
                            className="text-xs min-h-[80px] bg-background"
                            placeholder={`Enter ${key}...`}
                          />
                        ) : (
                          <Input
                            value={value}
                            onChange={e => updateReviewField(key, e.target.value)}
                            className="h-8 text-xs bg-background"
                            placeholder={`Enter ${key}...`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter className="flex items-center justify-between gap-2 pt-4 border-t mt-auto">
              <Button variant="ghost" size="sm" onClick={() => setStep('select')} disabled={isGenerating}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
              </Button>
              <Button onClick={generateDocument} disabled={isGenerating} size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200 dark:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98]">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGenerating ? 'Generating...' : 'Finalize & Generate'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const RfDocumentsTab = ({ rfp, onStageUpdate }: { rfp: ClientRFP, onStageUpdate: (stages: string[], isCompleting: boolean) => void }) => {
  const { isAdmin } = useAuth();
  const [files, setFiles] = React.useState(rfp.attachedFiles || []);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const toggleExpand = (docId: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const updateRfpFiles = (newFiles: any[]) => {
    setIsUpdating(true);
    const rfpRef = doc(db, 'rfps', rfp.id);
    const updateData = { attachedFiles: newFiles };

    updateDoc(rfpRef, updateData)
      .then(() => {
        setFiles(newFiles);
        toast({ title: 'Success', description: 'RFP documents updated.' });
      })
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
          path: rfpRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to update documents.',
        });
      })
      .finally(() => {
        setIsUpdating(false);
      });
  };

  const handleUploadNewVersion = (docIdx: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUpdating(true);
    const docToUpdate = { ...files[docIdx] };
    const storageRef = ref(storage, `rfps/${rfp.id}/documents/${Date.now()}-${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      null,
      (error: Error) => {
        toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
        setIsUpdating(false);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL: string) => {
          const oldVersion = {
            name: docToUpdate.name,
            url: docToUpdate.url,
            uploadedAt: docToUpdate.uploadedAt || new Date().toISOString()
          };
          
          const newVersions = [oldVersion, ...(docToUpdate.versions || [])];
          
          const updatedFile = {
            ...docToUpdate,
            name: file.name,
            url: downloadURL,
            uploadedAt: new Date().toISOString(),
            versions: newVersions
          };

          const newFiles = [...files];
          newFiles[docIdx] = updatedFile;
          updateRfpFiles(newFiles);
        });
      }
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">RFP Documents</CardTitle>
          <CardDescription>
            Manage all documents related to this RFP. You can upload new documents or update existing ones with new versions.
          </CardDescription>
        </div>
        <GenerateDocumentDialog rfp={rfp} onDocumentGenerated={(newFile) => {
          const currentFiles = [...files];
          const existingIdx = currentFiles.findIndex(existing => existing.name === newFile.name);
          
          if (existingIdx !== -1) {
            const existingFile = currentFiles[existingIdx];
            const oldVersion = {
              name: existingFile.name,
              url: existingFile.url,
              uploadedAt: existingFile.uploadedAt || new Date().toISOString()
            };
            
            currentFiles[existingIdx] = {
              ...existingFile,
              url: newFile.url,
              uploadedAt: new Date().toISOString(),
              versions: [oldVersion, ...(existingFile.versions || [])]
            };
            updateRfpFiles(currentFiles);
          } else {
            updateRfpFiles([...files, newFile]);
          }
        }} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label className="text-sm font-semibold text-primary/80 uppercase tracking-wider">Upload New Document</Label>
          <FileUpload
            value={null}
            onChange={(newFiles) => {
               const currentFiles = [...files];
               newFiles.forEach(f => {
                 const existingIdx = currentFiles.findIndex(existing => existing.name === f.name);
                 
                 if (existingIdx !== -1) {
                   const existingFile = currentFiles[existingIdx];
                   const oldVersion = {
                     name: existingFile.name,
                     url: existingFile.url,
                     uploadedAt: existingFile.uploadedAt || new Date().toISOString()
                   };
                   
                   currentFiles[existingIdx] = {
                     ...existingFile,
                     url: f.url,
                     uploadedAt: new Date().toISOString(),
                     versions: [oldVersion, ...(existingFile.versions || [])]
                   };
                 } else {
                   currentFiles.push({
                     ...f,
                     id: Math.random().toString(36).substr(2, 9),
                     uploadedAt: new Date().toISOString(),
                     versions: []
                   });
                 }
               });
               updateRfpFiles(currentFiles);
            }}
            folder={`rfps/${rfp.id}/documents`}
          />
        </div>

        <div className="space-y-3 pt-6 border-t">
          <Label className="text-sm font-semibold text-primary/80 uppercase tracking-wider">Existing Documents</Label>
          
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {files.map((file, idx) => {
                const docId = file.id || `file-${idx}`;
                const isExpanded = expandedDocs.has(docId);
                const hasVersions = file.versions && file.versions.length > 0;

                return (
                  <div key={docId} className="border rounded-xl overflow-hidden bg-background">
                    <div className="flex items-center justify-between p-4 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                           <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:text-primary transition-colors">
                            {file.name}
                           </a>
                           {file.uploadedAt && (
                             <span className="text-[10px] text-muted-foreground font-mono">
                               Latest: {format(new Date(file.uploadedAt), 'MMM d, yyyy HH:mm')}
                             </span>
                           )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <div className="relative">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 h-8"
                              onClick={() => document.getElementById(`version-upload-${idx}`)?.click()}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5" /> Upload New Version
                            </Button>
                            <input 
                              id={`version-upload-${idx}`}
                              type="file"
                              className="hidden"
                              onChange={(e) => handleUploadNewVersion(idx, e)}
                            />
                          </div>
                        )}

                        {hasVersions && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 pr-2"
                            onClick={() => toggleExpand(docId)}
                          >
                            <History className="mr-2 h-3.5 w-3.5" />
                            <span className="text-xs">{file.versions?.length} versions</span>
                            {isExpanded ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            const newFiles = files.filter((_, i) => i !== idx);
                            updateRfpFiles(newFiles);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && hasVersions && (
                      <div className="border-t bg-muted/5 p-4 animate-in slide-in-from-top-2 duration-200">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Version History</h5>
                        <div className="space-y-2">
                          {file.versions?.map((version, vIdx) => (
                            <div key={vIdx} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                              <div className="flex items-center gap-3">
                                <History className="h-3 w-3 text-muted-foreground" />
                                <a href={version.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline text-foreground/80">
                                  {version.name}
                                </a>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {format(new Date(version.uploadedAt), 'MMM d, yyyy HH:mm')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
      <StageCompletion stage="documents" rfp={rfp} onUpdate={onStageUpdate} />
    </Card>
  );
};

const InvitationTab = ({ rfp, onStageUpdate, onSendInvitationClick, onRfpUpdate }: { rfp: ClientRFP, onStageUpdate: (stages: string[], isCompleting: boolean) => void; onSendInvitationClick: (supplier: Supplier) => void; onRfpUpdate: (updated: Partial<ClientRFP>) => void }) => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const fetchSuppliers = async () => {
            if (!rfp.selectedSupplierIds || rfp.selectedSupplierIds.length === 0) {
                setLoading(false);
                return;
            }

            try {
                const suppliersQuery = query(collection(db, 'suppliers'), where('__name__', 'in', rfp.selectedSupplierIds));
                const querySnapshot = await getDocs(suppliersQuery);
                const fetchedSuppliers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
                setSuppliers(fetchedSuppliers);
            } catch (e: any) {
                setError(e.message);
                const permissionError = new FirestorePermissionError({ path: 'suppliers', operation: 'list' });
                errorEmitter.emit('permission-error', permissionError);
            } finally {
                setLoading(false);
            }
        };

        fetchSuppliers();
    }, [rfp.selectedSupplierIds]);

    const handleGenerateAccessCode = async (supplierId: string) => {
        // Use cryptographically secure random UUID — 122 bits of entropy, not brute-forceable
        const newCode = crypto.randomUUID().replace(/-/g, '').toUpperCase();
        const rfpRef = doc(db, 'rfps', rfp.id);
        const updatedCodes = { ...(rfp.supplierAccessCodes || {}), [supplierId]: newCode };

        try {
            await updateDoc(rfpRef, { supplierAccessCodes: updatedCodes });
            logAudit({ action: 'rfp.access_codes_updated', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, clientId: rfp.clientId, details: { rfpTitle: rfp.title, supplierName: suppliers.find(s => s.id === supplierId)?.companyName || supplierId } });
            onRfpUpdate({ supplierAccessCodes: updatedCodes });
            toast({ title: 'Success', description: 'Access code generated successfully.' });
        } catch (error) {
            console.error('Error generating access code:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate access code.' });
        }
    };

    const handleBlockSupplier = async (supplierId: string, block: boolean) => {
        const rfpRef = doc(db, 'rfps', rfp.id);
        const blockedSupplierIds = rfp.blockedSupplierIds || [];
        const supplierAccessCodes = { ...(rfp.supplierAccessCodes || {}) };

        let updatedBlocked = [...blockedSupplierIds];
        if (block) {
            if (!updatedBlocked.includes(supplierId)) {
                updatedBlocked.push(supplierId);
            }
            // Also revoke the access code when blocking
            delete supplierAccessCodes[supplierId];
        } else {
            updatedBlocked = updatedBlocked.filter(id => id !== supplierId);
        }

        try {
            await updateDoc(rfpRef, { 
                blockedSupplierIds: updatedBlocked,
                supplierAccessCodes: supplierAccessCodes
            });
            onRfpUpdate({ 
                blockedSupplierIds: updatedBlocked,
                supplierAccessCodes: supplierAccessCodes
            });
            toast({ 
                title: block ? 'Supplier Blocked' : 'Supplier Unblocked', 
                description: block ? 'Portal access has been revoked.' : 'Portal access can now be re-granted.' 
            });
        } catch (error) {
            console.error('Error updating blocked status:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update access status.' });
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied', description: 'Portal link copied to clipboard.' });
    };

    if (loading) {
        return <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />;
    }

    if (error) {
        return <div className="text-destructive text-center">Error loading selected suppliers: {error}</div>;
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Invitation</CardTitle>
                <CardDescription>
                    Invite selected vendors to the RFP and generate their portal access codes.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {suppliers.length > 0 ? (
                    <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Company Name</TableHead>
                                <TableHead>Contact Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {suppliers.map(supplier => {
                                 const code = rfp.supplierAccessCodes?.[supplier.id];
                                 const isBlocked = rfp.blockedSupplierIds?.includes(supplier.id);
                                 const portalLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${rfp.id}`;
                                 const displayPortalLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${rfp.id}`;

                                return (
                                <React.Fragment key={supplier.id}>
                                    <TableRow className="border-b-0 hover:bg-transparent">
                                        <TableCell className="font-semibold py-4 text-sm">
                                            <div className="flex items-center gap-3">
                                                <CompanyLogo logoUrl={supplier.logoUrl} name={supplier.companyName} className="h-7 w-7" iconClassName="h-3.5 w-3.5" />
                                                <span>{supplier.companyName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 text-sm">{Array.isArray(supplier.contacts) ? supplier.contacts[0]?.name : '—'}</TableCell>
                                        <TableCell className="py-4 text-sm text-muted-foreground">{Array.isArray(supplier.contacts) ? supplier.contacts[0]?.email : '—'}</TableCell>
                                        <TableCell className="py-4">
                                            {isBlocked ? (
                                                <Badge variant="destructive" className="text-[10px] px-2 py-0">
                                                    Blocked
                                                </Badge>
                                            ) : code ? (
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono text-[10px] px-2 py-0">
                                                    Active
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="text-[10px] px-2 py-0">
                                                    Pending
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right py-4 space-x-2">
                                            {isBlocked ? (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 shadow-sm transition-all text-green-600 hover:text-green-700 hover:bg-green-50"
                                                    onClick={() => handleBlockSupplier(supplier.id, false)}
                                                >
                                                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                                                    Unblock Access
                                                </Button>
                                            ) : (
                                                <>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-8 shadow-sm hover:bg-primary hover:text-primary-foreground transition-all"
                                                        onClick={() => onSendInvitationClick(supplier)}
                                                    >
                                                        <Send className="mr-2 h-3.5 w-3.5" />
                                                        Send Invitation
                                                    </Button>
                                                    {code && (
                                                        <Button 
                                                            variant="destructive" 
                                                            size="sm" 
                                                            className="h-8 shadow-sm transition-all"
                                                            onClick={() => handleBlockSupplier(supplier.id, true)}
                                                        >
                                                            <Lock className="mr-2 h-3.5 w-3.5" />
                                                            Cancel & Block
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={5} className="p-0 border-t-0 pb-3">
                                            <div className="mx-4 bg-muted/30 dark:bg-slate-900/40 rounded-lg p-3 border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between group transition-colors hover:border-primary/30">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center border shadow-sm shrink-0">
                                                        <MessageSquare className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">Portal: Proposals & Documents</span>
                                                        {code ? (
                                                            <a 
                                                                href={portalLink} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="text-xs text-primary font-medium hover:underline truncate max-w-[400px]"
                                                                title={portalLink}
                                                            >
                                                                {displayPortalLink}
                                                            </a>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handleGenerateAccessCode(supplier.id)}
                                                                className="text-xs text-muted-foreground italic text-left hover:text-primary transition-colors"
                                                            >
                                                                Required: Generate access code to activate portal link
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4 shrink-0">
                                                    {code ? (
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5 whitespace-nowrap">Access Password (RFP Unique)</span>
                                                                <div className="flex items-center gap-2 bg-background border px-2 py-0.5 rounded shadow-sm">
                                                                    <span className="font-mono font-bold text-primary tracking-widest text-xs uppercase">{code}</span>
                                                                    <div className="h-3 w-[1px] bg-slate-200 mx-1" />
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-5 w-5 hover:bg-transparent hover:text-primary p-0" 
                                                                        onClick={() => copyToClipboard(portalLink)}
                                                                        title="Copiar Link"
                                                                    >
                                                                        <ClipboardCopy className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        isBlocked ? (
                                                            <div className="text-xs text-destructive font-bold uppercase tracking-widest flex items-center gap-2">
                                                                <Lock className="h-3 w-3" /> Access Revoked & Locked
                                                            </div>
                                                        ) : (
                                                            <Button 
                                                                variant="default" 
                                                                size="sm" 
                                                                className="h-8 text-xs font-semibold px-4"
                                                                onClick={() => handleGenerateAccessCode(supplier.id)}
                                                            >
                                                                Generate Access
                                                            </Button>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <UserCheck className="mx-auto h-12 w-12" />
                        <p className="mt-4">No suppliers have been selected for this RFP yet.</p>
                        <p className="text-sm">Go to the &quot;Selection&quot; tab to choose suppliers.</p>
                    </div>
                )}
            </CardContent>
            <StageCompletion stage="invitation" rfp={rfp} onUpdate={onStageUpdate} />
        </Card>
    );
};

const SupplierProposalRow = ({
    supplier,
    proposals,
    rfp,
}: {
    supplier: Supplier;
    proposals: Proposal[];
    rfp: ClientRFP;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const latestProposal = proposals[0] || null;

    return (
        <Collapsible asChild key={supplier.id} open={isOpen} onOpenChange={setIsOpen}>
          <tbody>
            <TableRow className="hover:bg-muted/30 transition-colors">
              <TableCell>
                <div className="flex items-center gap-3">
                  <CompanyLogo logoUrl={supplier.logoUrl} name={supplier.companyName} className="h-6 w-6" iconClassName="h-3 w-3" />
                  <div className="flex flex-col">
                    <span className="font-medium">{supplier.companyName}</span>
                    {latestProposal && (
                       <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-none mt-1">
                         {proposals.length} Submissions (Latest: Rev {latestProposal.revision ?? 0})
                       </span>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={latestProposal ? 'default' : 'secondary'}>
                {latestProposal ? latestProposal.status : 'Pending'}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {latestProposal
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    }).format(latestProposal.price)
                : 'N/A'}
              </TableCell>
               <TableCell className="text-right font-bold text-primary">
                {latestProposal ? (latestProposal.finalScore || 0).toFixed(1) : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                   <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 group">
                        <FileText className="mr-2 h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
                        Show Docs
                        {isOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                    </Button>
                   </CollapsibleTrigger>
                   {latestProposal && (
                        <Button asChild variant="outline" size="sm" className="h-8">
                            <Link to={`/dashboard/proposals/${latestProposal.id}`}>
                                Evaluate
                            </Link>
                        </Button>
                   )}
                </div>
              </TableCell>
            </TableRow>
            <CollapsibleContent asChild>
                <TableRow className="bg-muted/20 border-t-0">
                    <TableCell colSpan={5} className="p-6">
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 pb-2 border-b">
                                <History className="h-4 w-4 text-primary" />
                                <h4 className="font-bold text-xs uppercase tracking-widest text-foreground">Revision Folders</h4>
                            </div>

                            {proposals.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {proposals.map((p) => (
                                        <div key={p.id} className="bg-background border rounded-xl p-4 shadow-sm hover:border-primary/30 transition-colors">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                                        <FolderOpen className="h-3.5 w-3.5" />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-tight">Revision {p.revision ?? 0}</span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    {format(ensureDate(p.submittedAt), 'MMM d, p')}
                                                </span>
                                            </div>
                                            
                                            {p.attachments && p.attachments.length > 0 ? (
                                                <ul className="space-y-1.5 ml-1">
                                                    {p.attachments.map((doc, i) => (
                                                        <li key={i} className="flex items-center gap-2 group">
                                                            <Paperclip className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                                            <a
                                                                href={doc.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[11px] text-muted-foreground hover:text-primary hover:underline truncate"
                                                            >
                                                                {doc.name}
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-[10px] text-muted-foreground italic">No documents attached.</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-background/50 rounded-xl border border-dashed">
                                    <p className="text-xs text-muted-foreground italic">No submissions yet.</p>
                                </div>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            </CollapsibleContent>
          </tbody>
        </Collapsible>
      );
};


const ProposalsTab = ({ rfp, onStageUpdate }: { rfp: ClientRFP, onStageUpdate: (stages: string[], isCompleting: boolean) => void }) => {
  const [proposalsValue, proposalsLoading] = useCollection(
    query(collection(db, 'proposals'), where('rfpId', '==', rfp.id))
  );

  const [suppliersValue, suppliersLoading] = useCollection(
    rfp.selectedSupplierIds && rfp.selectedSupplierIds.length > 0
      ? query(collection(db, 'suppliers'), where('__name__', 'in', rfp.selectedSupplierIds))
      : null
  );

  const proposals = useMemo(() =>
    proposalsValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Proposal)) || [], [proposalsValue]);

  const suppliers = useMemo(() =>
    suppliersValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)) || [], [suppliersValue]);

  const proposalsBySupplier = useMemo(() => {
    const map = new Map<string, Proposal[]>();
    suppliers.forEach(s => map.set(s.id, []));
    proposals.forEach(p => {
      const list = map.get(p.supplierId) || [];
      list.push(p);
      list.sort((a, b) => (b.revision || 1) - (a.revision || 1));
      map.set(p.supplierId, list);
    });
    return map;
  }, [proposals, suppliers]);


  if (proposalsLoading || suppliersLoading) {
    return <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />;
  }
  
  if (!rfp.selectedSupplierIds || rfp.selectedSupplierIds.length === 0) {
    return (
      <Card>
         <CardHeader>
          <CardTitle className="text-lg">Proposals</CardTitle>
          <CardDescription>
            Review and evaluate proposals received from suppliers.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="text-center text-muted-foreground py-8">
            <UserCheck className="mx-auto h-12 w-12" />
            <p className="mt-4">No suppliers have been selected for this RFP yet.</p>
            <p className="text-sm">Go to the &quot;Selection&quot; tab to choose suppliers.</p>
          </div>
        </CardContent>
         <StageCompletion stage="proposals" rfp={rfp} onUpdate={onStageUpdate} />
      </Card>
    );
  }
  
  return (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Proposals</CardTitle>
      <CardDescription>
        Review and evaluate proposals received from suppliers.
      </CardDescription>
    </CardHeader>
    <CardContent>
        <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Final Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
           {suppliers.map((supplier) => {
             const supplierProposals = proposalsBySupplier.get(supplier.id) || [];
             return (
               <SupplierProposalRow
                 key={supplier.id}
                 supplier={supplier}
                 proposals={supplierProposals}
                 rfp={rfp}
               />
             );
          })}
        </Table>
        </div>
    </CardContent>
    <StageCompletion stage="proposals" rfp={rfp} onUpdate={onStageUpdate} />
  </Card>
)};

const QuestionsTab = ({ rfp, onStageUpdate }: { rfp: ClientRFP; onStageUpdate: (stages: string[], isCompleting: boolean) => void }) => {
  const { toast } = useToast();
  const [questionsValue, loading] = useCollection(
    query(collection(db, 'rfp_questions'), where('rfpId', '==', rfp.id))
  );

  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerAttachments, setAnswerAttachments] = useState<{ name: string; url: string }[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [suppliers, setSuppliers] = useState<Map<string, Supplier>>(new Map());

  useEffect(() => {
    const fetchSuppliers = async () => {
        if (!rfp.selectedSupplierIds || rfp.selectedSupplierIds.length === 0) return;
        try {
            const suppliersQuery = query(collection(db, 'suppliers'), where('__name__', 'in', rfp.selectedSupplierIds));
            const suppliersSnapshot = await getDocs(suppliersQuery);
            const fetchedSuppliers = new Map<string, Supplier>();
            suppliersSnapshot.docs.forEach(doc => {
                fetchedSuppliers.set(doc.id, { id: doc.id, ...doc.data() } as Supplier);
            });
            setSuppliers(fetchedSuppliers);
        } catch (error) {
            console.error("Error fetching suppliers for Q&A:", error);
        }
    };
    fetchSuppliers();
  }, [rfp.selectedSupplierIds]);

  const questions = useMemo(() => 
    questionsValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as RfpQuestion))
      .sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : (a.createdAt as any)?.toDate?.() || new Date(0);
        const dateB = b.createdAt instanceof Date ? b.createdAt : (b.createdAt as any)?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      }) || [], 
  [questionsValue]);

  const handleAnswerSubmit = async (qId: string) => {
    setIsSaving(true);
    try {
      const qRef = doc(db, 'rfp_questions', qId);
      await updateDoc(qRef, {
        answer: answerText,
        answerAttachments: answerAttachments,
        isPublic,
        answeredAt: new Date(),
      });
      toast({ title: 'Success', description: 'Answer submitted.' });
      setAnsweringId(null);
      setAnswerText('');
      setAnswerAttachments([]);
      setIsPublic(false);
    } catch (error) {
      console.error('Error answering question:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit answer.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Supplier Questions & Answers</CardTitle>
        <CardDescription>
          Respond to supplier queries. Public answers will be visible to all participants anonymously.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <MessageSquare className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p>No questions received yet.</p>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[150px]">Supplier</TableHead>
                  <TableHead className="w-[30%]">Question</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[20%]">Answer</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <React.Fragment key={q.id}>
                    <TableRow className={cn(answeringId === q.id ? "bg-primary/5" : "hover:bg-muted/30")}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CompanyLogo logoUrl={suppliers.get(q.supplierId)?.logoUrl} name={q.supplierName || 'Supplier'} className="h-6 w-6" iconClassName="h-3 w-3" />
                          <span className="text-xs font-semibold truncate max-w-[120px]">{q.supplierName || 'Supplier'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-tight">{q.question}</p>
                          {q.questionAttachments && q.questionAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {q.questionAttachments.map((file, i) => (
                                <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 border text-[9px] hover:bg-muted transition-colors">
                                  <FileText className="h-2.5 w-2.5 text-primary" />
                                  <span className="truncate max-w-[80px]">{file.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">
                        {format(ensureDate(q.createdAt), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell>
                        {q.answer ? (
                          <Badge variant={q.isPublic ? 'default' : 'secondary'} className="text-[10px] py-0.5">
                            {q.isPublic ? 'Public' : 'Private'}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {q.answer ? (
                          <Badge variant="outline" className="text-[10px] py-0.5 border-green-500/30 text-green-600 bg-green-50">Answered</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0.5 border-amber-500/30 text-amber-600 bg-amber-50">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={q.answer}>
                            {q.answer || '-'}
                          </p>
                          {q.answerAttachments && q.answerAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {q.answerAttachments.map((file, i) => (
                                <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/5 border border-primary/10 text-[9px] hover:bg-primary/10 transition-colors">
                                  <FileText className="h-2.5 w-2.5 text-primary" />
                                  <span className="truncate max-w-[80px] text-primary">{file.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant={answeringId === q.id ? "secondary" : "ghost"} 
                          size="sm" 
                          onClick={() => {
                            if (answeringId === q.id) {
                              setAnsweringId(null);
                            } else {
                              setAnsweringId(q.id);
                              setAnswerText(q.answer || '');
                              setAnswerAttachments(q.answerAttachments || []);
                              setIsPublic(q.isPublic || false);
                            }
                          }}
                        >
                          {q.answer ? 'Edit' : 'Reply'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    
                    {answeringId === q.id && (
                      <TableRow className="bg-primary/5 hover:bg-primary/5 border-t-0">
                        <TableCell colSpan={7} className="pb-6 pt-0 px-6">
                          <div className="bg-background rounded-xl border p-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
                             <div className="space-y-4">
                               <div className="flex items-center justify-between mb-2">
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Drafting Response</span>
                                 <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAnsweringId(null)}>×</Button>
                               </div>
                               <Textarea 
                                 placeholder="Write your answer..." 
                                 value={answerText} 
                                 onChange={(e) => setAnswerText(e.target.value)}
                                 className="text-sm min-h-[100px] bg-muted/20"
                               />
                               <div className="space-y-2">
                                 <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Answer Attachments</Label>
                                 <FileUpload
                                   value={answerAttachments}
                                   onChange={setAnswerAttachments}
                                   folder={`rfps/${rfp.id}/questions/${q.id}/answer`}
                                 />
                               </div>
                               <div className="flex items-center justify-between">
                                 <div className="flex items-center space-x-2">
                                   <Checkbox id={`public-${q.id}`} checked={isPublic} onCheckedChange={(checked) => setIsPublic(!!checked)} />
                                   <Label htmlFor={`public-${q.id}`} className="text-xs cursor-pointer font-medium text-muted-foreground">Make this answer public to all suppliers</Label>
                                 </div>
                                 <div className="flex gap-2">
                                   <Button variant="ghost" size="sm" onClick={() => setAnsweringId(null)}>Cancel</Button>
                                   <Button size="sm" onClick={() => handleAnswerSubmit(q.id)} disabled={isSaving || !answerText.trim()}>
                                     {isSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                                     {q.answer ? 'Update Answer' : 'Submit Answer'}
                                   </Button>
                                 </div>
                               </div>
                             </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <StageCompletion stage="questions" rfp={rfp} onUpdate={onStageUpdate} />
    </Card>
  );
};

const ANALYSIS_SECTIONS = [
  { id: 'technical', title: 'Technical Scope & Specifications', icon: FileText },
  { id: 'schedule', title: 'Schedule & Timelines', icon: ListChecks },
  { id: 'pricing', title: 'Pricing & Cost Breakdown', icon: Bot },
  { id: 'risk', title: 'Risk Profile & Mitigation', icon: MessageSquare },
  { id: 'commercial', title: 'Commercial Terms & Conditions', icon: Award },
  { id: 'deviations', title: 'Deviations & Exclusions', icon: Mail },
];

const AnalysisTab = ({ rfp, onRfpUpdate, onStageUpdate, clientData }: { rfp: ClientRFP; onRfpUpdate: (updatedRfp: Partial<ClientRFP>) => void; onStageUpdate: (stages: string[], isCompleting: boolean) => void; clientData?: Client | null }) => {
    const { toast } = useToast();
    const [isLoadingSection, setIsLoadingSection] = useState<string | null>(null);
    const [isSavingSection, setIsSavingSection] = useState<string | null>(null);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    const toggleSection = (id: string) =>
      setCollapsedSections(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    const expandAll = () => setCollapsedSections(new Set());
    const collapseAll = () => setCollapsedSections(new Set(ANALYSIS_SECTIONS.map(s => s.id)));
    
    const [revFilter, setRevFilter] = useState<'all' | 'latest' | string>('latest');
    
    // Support both old single summary and new sectional summary
    const [sectionsContent, setSectionsContent] = useState<Record<string, string>>(rfp.aiAnalysisSections || {});
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [suppliers, setSuppliers] = useState<Map<string, Supplier>>(new Map());

    const availableRevisions = useMemo(() => {
        const revs = new Set<number>();
        proposals.forEach(p => {
            if (p.revision !== undefined) revs.add(p.revision);
        });
        return Array.from(revs).sort((a, b) => a - b);
    }, [proposals]);

    const filteredProposals = useMemo(() => {
        if (revFilter === 'all') return proposals;
        if (revFilter === 'latest') {
            const latestMap = new Map<string, Proposal>();
            proposals.forEach(p => {
                const current = latestMap.get(p.supplierId);
                if (!current || (p.revision ?? 0) > (current.revision ?? 0)) {
                    latestMap.set(p.supplierId, p);
                }
            });
            return Array.from(latestMap.values());
        }
        const revNum = parseInt(revFilter);
        return proposals.filter(p => (p.revision ?? 0) === revNum);
    }, [proposals, revFilter]);
  
  
    useEffect(() => {
      const fetchData = async () => {
        setIsDataLoading(true);
        try {
          const proposalsQuery = query(collection(db, 'proposals'), where('rfpId', '==', rfp.id));
          const proposalsSnapshot = await getDocs(proposalsQuery);
          const fetchedProposals = proposalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Proposal));
          setProposals(fetchedProposals);
  
          if (fetchedProposals.length > 0) {
              const supplierIds = fetchedProposals.map(p => p.supplierId);
              const uniqueSupplierIds = [...new Set(supplierIds)];
              if (uniqueSupplierIds.length > 0) {
                const suppliersQuery = query(collection(db, 'suppliers'), where('__name__', 'in', uniqueSupplierIds));
                const suppliersSnapshot = await getDocs(suppliersQuery);
                const fetchedSuppliers = new Map<string, Supplier>();
                suppliersSnapshot.docs.forEach(doc => {
                    fetchedSuppliers.set(doc.id, { id: doc.id, ...doc.data() } as Supplier);
                });
                setSuppliers(fetchedSuppliers);
              }
          }
        } catch (error) {
          console.error("Error fetching analysis data:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to load proposal and supplier data.' });
        } finally {
          setIsDataLoading(false);
        }
      };
      fetchData();
    }, [rfp.id, toast]);
  
  
    const handleRunSectionAnalysis = async (sectionId: string, sectionTitle: string) => {
      if (!proposals || proposals.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Proposals Found',
          description: 'There are no proposals to analyze for this RFP.',
        });
        return;
      }
  
      setIsLoadingSection(sectionId);
  
      try {
          const documentsForAnalysis = (await Promise.all(
              proposals.map(async (proposal) => {
                const supplierName = suppliers.get(proposal.supplierId)?.companyName || 'Unknown Supplier';
                
                if (!proposal.attachments || proposal.attachments.length === 0) {
                  return [];
                }
      
                return Promise.all(
                  (proposal.attachments).map(async (attachment: { name: string, url: string }) => {
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
          section: sectionTitle
        });
  
        if (!result) {
          throw new Error("AI analysis did not produce an output.");
        }
  
        setSectionsContent(prev => ({ ...prev, [sectionId]: result.summary }));
        
        // If the analysis returns specific data points, update them too
        if (result.price && result.price > 0 && sectionId === 'pricing') {
            // Price is usually per proposal, so this might need careful handling if multiple
        }
        
        if (result.scheduleData && result.scheduleData.length > 0 && sectionId === 'schedule') {
             onRfpUpdate({ aiScheduleData: result.scheduleData });
             // Also save schedule data to db
             const rfpRef = doc(db, 'rfps', rfp.id);
             await updateDoc(rfpRef, { aiScheduleData: result.scheduleData });
        }

        toast({
          title: 'Analysis Complete',
          description: `The ${sectionTitle} evaluation has finished successfully.`,
        });
      } catch (error) {
        console.error('AI Analysis Error:', error);
        toast({
          variant: 'destructive',
          title: 'Analysis Failed',
          description:
            error instanceof Error ? error.message : 'An error occurred during the AI evaluation. Please try again.',
        });
      } finally {
        setIsLoadingSection(null);
      }
    };
  
    const handleSaveSection = async (sectionId: string) => {
      const content = sectionsContent[sectionId];
      if (!content) return;
      
      setIsSavingSection(sectionId);
      
      const rfpRef = doc(db, 'rfps', rfp.id);
      const updatedSections = { ...(rfp.aiAnalysisSections || {}), [sectionId]: content };
  
      try {
          await updateDoc(rfpRef, { aiAnalysisSections: updatedSections });
          toast({
              title: 'Success',
              description: 'Section analysis has been saved.',
          });
          onRfpUpdate({ aiAnalysisSections: updatedSections });
      } catch (serverError) {
          console.error("Save Error:", serverError);
          toast({
              variant: 'destructive',
              title: 'Error',
              description: 'Failed to save the section.',
          });
      } finally {
          setIsSavingSection(null);
      }
    };

    const generateAnalysisDoc = async () => {
        setIsGeneratingPdf(true);
        toast({
            title: 'Generating Analysis Doc',
            description: 'Formatting with Arial and Justified alignment...',
        });

        try {
            const { 
                Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ImageRun
            } = docx;

            const children: any[] = [];
            const PINK_PRIMARY = "db2777";
            const PINK_LIGHT = "fdf2f8";
            const FONT_FAMILY = "Arial";

            // Helper to capture chart as base64
            const captureChart = async (id: string) => {
                const el = document.getElementById(id);
                if (!el) return null;
                try {
                    const canvas = await html2canvas(el, { 
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false,
                        useCORS: true
                    });
                    return canvas.toDataURL('image/png');
                } catch (e) {
                    console.error(`Failed to capture chart ${id}:`, e);
                    return null;
                }
            };

            const radarImg = await captureChart('radar-chart-container');
            const priceImg = await captureChart('price-chart-container');
            const scheduleImg = await captureChart('schedule-chart-container');

            // --- COVER PAGE ---
            children.push(new Paragraph({ 
                children: [new TextRun({ text: "PROPOSAL ANALYSIS REPORT", bold: true, size: 56, font: FONT_FAMILY, color: PINK_PRIMARY })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 2000, after: 600 }
            }));

            children.push(new Paragraph({ 
                children: [new TextRun({ text: rfp.title.toUpperCase(), bold: true, size: 36, font: FONT_FAMILY })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 1200 }
            }));

            const infoRow = (label: string, value: string) => {
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${label}: `, bold: true, size: 24, font: FONT_FAMILY }),
                        new TextRun({ text: value, size: 24, font: FONT_FAMILY })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }));
            };

            infoRow("Client", clientData?.name || "Private Client");
            infoRow("Location", `${rfp.cityName || 'N/A'}, ${rfp.stateCode || ''} ${rfp.countryCode || ''}`);
            infoRow("Status", rfp.status.toUpperCase());
            infoRow("Open Date", format(ensureDate(rfp.openDate), 'PPP'));
            infoRow("Close Date", format(ensureDate(rfp.closeDate), 'PPP'));

            children.push(new Paragraph({ 
                children: [new TextRun({ text: `Report Generated on: ${format(new Date(), 'PPP')}`, size: 20, italics: true, font: FONT_FAMILY })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 2000 }
            }));

            children.push(new Paragraph({ 
                children: [new TextRun("")], 
                pageBreakBefore: true 
            }));
            // --- END COVER PAGE ---

            // --- TABLE OF CONTENTS ---
            children.push(new Paragraph({
                children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, size: 36, color: PINK_PRIMARY, font: FONT_FAMILY })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }));

            // docx TableOfContents requires header levels to be set
            const { TableOfContents } = docx;
            children.push(new TableOfContents("Table of Contents", {
                hyperlink: true,
                headingStyleRange: "1-3",
            }));

            children.push(new Paragraph({ 
                children: [new TextRun("")], 
                pageBreakBefore: true 
            }));
            // --- END TABLE OF CONTENTS ---

            // --- EXECUTIVE SUMMARY TABLE ---
            children.push(new Paragraph({ 
                children: [new TextRun({ text: "EXECUTIVE SUMMARY", bold: true, size: 36, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                heading: HeadingLevel.HEADING_1, 
                spacing: { before: 400, after: 300 } 
            }));

            const sortedProposals = [...filteredProposals].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
            
            if (sortedProposals.length > 0) {
                const headerCells = ["Supplier", "Comm.", "EHS", "Sched.", "Qual.", "Risk", "Total"].map(text => 
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: text, bold: true, size: 20, font: FONT_FAMILY })],
                            alignment: AlignmentType.CENTER
                        })],
                        shading: { fill: PINK_LIGHT }
                    })
                );

                const dataRows = sortedProposals.map((p, idx) => {
                    const baseName = suppliers.get(p.supplierId)?.companyName || "Unknown";
                    const name = `${baseName} rev ${p.revision ?? 0}`;
                    const isWinner = idx === 0;
                    
                    return new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: name, bold: isWinner, size: 20, font: FONT_FAMILY })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (p.commercialScore || 0).toString(), size: 20, font: FONT_FAMILY })], alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (p.ehsScore || 0).toString(), size: 20, font: FONT_FAMILY })], alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (p.scheduleScore || 0).toString(), size: 20, font: FONT_FAMILY })], alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (p.qualityScore || 0).toString(), size: 20, font: FONT_FAMILY })], alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (p.riskScore || 0).toString(), size: 20, font: FONT_FAMILY })], alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (p.finalScore || 0).toFixed(1), bold: true, size: 20, color: isWinner ? PINK_PRIMARY : undefined, font: FONT_FAMILY })], alignment: AlignmentType.CENTER })] }),
                        ]
                    });
                });

                children.push(new Table({
                    rows: [new TableRow({ children: headerCells }), ...dataRows],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                        left: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                        right: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                    }
                }));

                children.push(new Paragraph({ 
                    children: [new TextRun({ text: `* Winner: ${suppliers.get(sortedProposals[0].supplierId)?.companyName || "N/A"}`, bold: true, color: PINK_PRIMARY, size: 22, font: FONT_FAMILY })],
                    spacing: { before: 200, after: 400 }
                }));

                // Winner Detail
                const winner = sortedProposals[0];
                const winnerSupplier = suppliers.get(winner.supplierId);

                children.push(new Paragraph({ 
                    children: [new TextRun({ text: "WINNER PORTFOLIO", bold: true, size: 28, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                    spacing: { before: 300, after: 150 } 
                }));

                const addDetail = (label: string, value: string) => {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({ text: `${label}: `, bold: true, size: 22, font: FONT_FAMILY }),
                            new TextRun({ text: value, size: 22, font: FONT_FAMILY })
                        ],
                        spacing: { after: 100 }
                    }));
                };

                addDetail("Winning Supplier", winnerSupplier?.companyName || "N/A");
                addDetail("Contact Person", winnerSupplier?.contacts?.[0]?.name || "N/A");
                addDetail("Email", winnerSupplier?.contacts?.[0]?.email || "N/A");

                if (winner.attachments && winner.attachments.length > 0) {
                    children.push(new Paragraph({ 
                        children: [new TextRun({ text: "Submitted Documents:", bold: true, size: 22, font: FONT_FAMILY })],
                        spacing: { before: 200, after: 100 }
                    }));
                    winner.attachments.forEach(file => {
                        children.push(new Paragraph({
                            children: [new TextRun({ text: `• ${file.name}`, size: 20, font: FONT_FAMILY })],
                            indent: { left: 720 }
                        }));
                    });
                }
                
                children.push(new Paragraph({ text: "", pageBreakBefore: true }));
            }
            // --- END EXECUTIVE SUMMARY ---

            // Add Charts Section
            const addChartToDoc = (dataUrl: string | null, title: string) => {
                if (!dataUrl) return;
                
                children.push(new Paragraph({
                    children: [new TextRun({ text: title, bold: true, size: 28, color: PINK_PRIMARY, font: FONT_FAMILY })],
                    spacing: { before: 400, after: 200 }
                }));

                const base64Data = dataUrl.split(',')[1];
                const binaryData = atob(base64Data);
                const bytes = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    bytes[i] = binaryData.charCodeAt(i);
                }

                children.push(new Paragraph({
                    children: [
                        new ImageRun({
                            data: bytes,
                            transformation: { width: 600, height: 320 }
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 }
                }));
            };

            if (radarImg || priceImg || scheduleImg) {
                children.push(new Paragraph({ 
                    children: [new TextRun({ text: "VISUAL COMPARISON", bold: true, size: 36, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                    heading: HeadingLevel.HEADING_1, 
                    spacing: { before: 400, after: 300 } 
                }));
                
                addChartToDoc(radarImg, "Multi-Criteria Evaluation Radar");
                addChartToDoc(priceImg, "Price Comparison Analysis");
                addChartToDoc(scheduleImg, "Project Execution Timeline (Gantt)");
            }

            // Helper to parse simple markdown to docx elements
            const parseMarkdownToDocx = (text: string) => {
                const lines = text.split('\n');
                let currentTableRows: any[] = [];
                let rowCount = 0; // Better tracking for shading

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();

                    // Table detection
                    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                        if (trimmed.includes('---')) continue;
                        
                        const cells = trimmed.slice(1, -1).split('|').map(c => c.trim().replace(/\*\*/g, '').replace(/[*_#]/g, ''));
                        const isHeader = rowCount === 0;
                        
                        currentTableRows.push(new TableRow({
                            children: cells.map(cellText => new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: cellText, bold: isHeader, size: 20, font: FONT_FAMILY })],
                                    alignment: AlignmentType.LEFT
                                })],
                                shading: isHeader ? { fill: PINK_LIGHT } : undefined
                            }))
                        }));
                        rowCount++;
                        continue;
                    } else if (currentTableRows.length > 0) {
                        children.push(new Table({
                            rows: currentTableRows,
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                                bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                                left: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                                right: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
                            }
                        }));
                        children.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }));
                        currentTableRows = [];
                        rowCount = 0;
                    }

                    // Headers
                    if (trimmed.startsWith('### ')) {
                        children.push(new Paragraph({ 
                            children: [new TextRun({ text: trimmed.replace('### ', ''), bold: true, size: 28, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                            spacing: { before: 240, after: 120 } 
                        }));
                    } else if (trimmed.startsWith('## ')) {
                        children.push(new Paragraph({ 
                            children: [new TextRun({ text: trimmed.replace('## ', ''), bold: true, size: 32, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                            spacing: { before: 300, after: 150 } 
                        }));
                    } else if (trimmed.startsWith('# ')) {
                        children.push(new Paragraph({ 
                            children: [new TextRun({ text: trimmed.replace('# ', ''), bold: true, size: 36, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                            heading: HeadingLevel.HEADING_1, 
                            spacing: { before: 400, after: 200 } 
                        }));
                    } 
                    // Lists
                    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                        children.push(new Paragraph({
                            children: [new TextRun({ text: trimmed.substring(2).replace(/\*\*/g, '').replace(/[*_#]/g, ''), size: 22, font: FONT_FAMILY })],
                            bullet: { level: 0 },
                            spacing: { after: 100 },
                            alignment: AlignmentType.JUSTIFIED
                        }));
                    }
                    // Bold lines or regular text
                    else if (trimmed) {
                        const isBold = trimmed.startsWith('**') && trimmed.endsWith('**');
                        const text = trimmed.replace(/\*\*/g, '').replace(/[*_#]/g, '');
                        children.push(new Paragraph({
                            children: [new TextRun({ text, size: 22, bold: isBold, font: FONT_FAMILY })],
                            spacing: { after: 120 },
                            alignment: AlignmentType.JUSTIFIED
                        }));
                    }
                }
                
                if (currentTableRows.length > 0) {
                    children.push(new Table({ rows: currentTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                }
            };

            ANALYSIS_SECTIONS.forEach((section) => {
                const content = sectionsContent[section.id];
                if (content) {
                    children.push(new Paragraph({ 
                        children: [new TextRun({ text: section.title, bold: true, size: 40, color: PINK_PRIMARY, font: FONT_FAMILY })], 
                        heading: HeadingLevel.HEADING_1, 
                        spacing: { before: 600, after: 300 } 
                    }));
                    parseMarkdownToDocx(content);
                }
            });

            const wordDoc = new Document({
                creator: "ProcureFlow AI",
                title: `${rfp.title} - Proposal Analysis`,
                styles: {
                    default: {
                        document: {
                            run: {
                                font: FONT_FAMILY,
                            },
                        },
                    },
                },
                sections: [{ children }],
            });

            const blob = await Packer.toBlob(wordDoc);
            const today = format(new Date(), 'yyyy-MM-dd');
            saveAs(blob, `${today}-${rfp.title.replace(/[^a-z0-9]/gi, '_')}-Analysis_Report.docx`);
            
            toast({
                title: 'Success',
                description: 'Professional analysis report generated.',
            });
        } catch (error) {
            console.error('Generation Error:', error);
            toast({
                variant: 'destructive',
                title: 'Generation Failed',
                description: 'Failed to generate the report. Check the console.',
            });
        } finally {
            setIsGeneratingPdf(false);
        }
    };



  
    const SUPPLIER_COLORS = [
      "hsl(var(--primary))",
      "hsl(142, 76%, 36%)", // Green
      "hsl(217, 91%, 60%)", // Blue
      "hsl(333, 71%, 51%)", // Rose
      "hsl(47, 95%, 55%)",  // Yellow/Gold
      "hsl(262, 83%, 58%)", // Purple
      "hsl(24, 94%, 53%)",  // Orange
      "hsl(188, 86%, 53%)", // Cyan
    ];

    const getSupplierColor = (index: number) => SUPPLIER_COLORS[index % SUPPLIER_COLORS.length];

    const priceChartData = useMemo(() => {
        if (!filteredProposals || suppliers.size === 0) return [];
        // Sort or use a consistent order for supplier colors
        const supplierIds = [...suppliers.keys()].sort();
        
        const data = filteredProposals.map(p => ({
            name: `${suppliers.get(p.supplierId)?.companyName || 'Unknown'} rev ${p.revision ?? 0}`,
            price: p.price,
            fill: getSupplierColor(supplierIds.indexOf(p.supplierId))
        })).filter(item => item.price > 0);

        // Add Budget bar at the beginning for direct comparison
        if (rfp.budget > 0) {
          data.unshift({
            name: 'Project Budget',
            price: rfp.budget,
            fill: 'hsl(262 80% 50%)' // Same purple as dashboard budget
          });
        }
        return data;
      }, [filteredProposals, suppliers, rfp.budget]);
  
    const scheduleChartData = useMemo(() => {
      // Use rfp.aiScheduleData directly as it might be updated after running the schedule section
      if (!rfp.aiScheduleData) return [];
      
      const allDates = rfp.aiScheduleData.flatMap(d => [parseISO(d.startDate), parseISO(d.endDate)]);
      if (allDates.length === 0) return [];
      const overallMinDate = new Date(Math.min(...allDates.map(d => d.getTime())));

      // Map supplier names to IDs to get consistent colors if possible, 
      // but aiScheduleData might only have names. Let's find IDs from names.
      const supplierIdsByName = new Map<string, string>();
      suppliers.forEach((s, id) => supplierIdsByName.set(s.companyName, id));
      const sortedSupplierIds = [...suppliers.keys()].sort();
      
      return rfp.aiScheduleData.map(item => {
        const startDate = parseISO(item.startDate);
        const endDate = parseISO(item.endDate);
        const supplierId = supplierIdsByName.get(item.supplierName);
        const color = supplierId ? getSupplierColor(sortedSupplierIds.indexOf(supplierId)) : SUPPLIER_COLORS[0];
        
        // Find matching proposal in the filtered set if possible to add "rev X"
        const matchedProposal = supplierId ? filteredProposals.find(p => p.supplierId === supplierId) : null;
        const displayName = matchedProposal 
          ? `${item.supplierName} rev ${matchedProposal.revision ?? 0}`
          : item.supplierName;
          
        return {
          name: displayName,
          range: [differenceInDays(startDate, overallMinDate), differenceInDays(endDate, overallMinDate)],
          startDate: format(startDate, 'MMM, yyyy'),
          endDate: format(endDate, 'MMM, yyyy'),
          duration: differenceInDays(endDate, startDate),
          fill: color
        };
      });
    }, [rfp.aiScheduleData, suppliers, filteredProposals]);
  
    const radarChartData = useMemo(() => {
        if (!filteredProposals || filteredProposals.length === 0 || suppliers.size === 0) return [];
        
        const criteria = [
          { key: 'commercialScore', label: 'Commercial' },
          { key: 'ehsScore', label: 'EHS' },
          { key: 'scheduleScore', label: 'Schedule' },
          { key: 'qualityScore', label: 'Quality' },
          { key: 'riskScore', label: 'Risk' },
        ];
  
        return criteria.map(c => {
          const entry: any = { subject: c.label, fullMark: 100 };
          filteredProposals.forEach(p => {
            const supplierName = `${suppliers.get(p.supplierId)?.companyName || 'Unknown'} rev ${p.revision ?? 0}`;
            entry[supplierName] = p[c.key as keyof Proposal] || 0;
          });
          return entry;
        });
      }, [filteredProposals, suppliers]);

    const activeSupplierProposals = useMemo(() => {
        return proposals.filter(p => suppliers.has(p.supplierId));
    }, [proposals, suppliers]);

    const radarChartConfig = useMemo(() => {
        const config: any = {};
        const supplierIds = [...suppliers.keys()].sort();
        
        filteredProposals.forEach(p => {
            const name = `${suppliers.get(p.supplierId)?.companyName || 'Unknown'} rev ${p.revision ?? 0}`;
            config[name] = {
                label: name,
                color: getSupplierColor(supplierIds.indexOf(p.supplierId))
            };
        });
        return config;
    }, [filteredProposals, suppliers]);
  
  
    const priceChartConfig = {
      price: {
          label: "Price (USD)",
          color: "hsl(var(--primary))",
      },
    };
  
    const scheduleChartConfig = {
      range: {
        label: "Timeline",
        color: "hsl(var(--accent))",
      }
    };
  
  
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                <CardTitle className="text-lg">AI-Powered Analysis</CardTitle>
                <CardDescription>
                    Run comparative evaluations by topic. Each section can be generated and saved individually.
                </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Analysis Revision Filter</Label>
                        <Select value={revFilter} onValueChange={setRevFilter}>
                            <SelectTrigger className="w-[200px] h-9 text-xs font-bold bg-muted/20 border-primary/10">
                                <SelectValue placeholder="Filter by revision..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="latest">Latest (Recommended)</SelectItem>
                                <SelectItem value="all">Show All Versions</SelectItem>
                                {availableRevisions.map(rev => (
                                    <SelectItem key={rev} value={rev.toString()}>Revision {rev}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={expandAll}>
                            <ChevronsUpDown className="mr-2 h-3.5 w-3.5" /> Expand All
                        </Button>
                        <Button variant="outline" size="sm" onClick={collapseAll}>
                            <ChevronsUpDown className="mr-2 h-3.5 w-3.5 rotate-180" /> Collapse All
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={generateAnalysisDoc} 
                            disabled={isGeneratingPdf || isDataLoading}
                        >
                            {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                            Generate Analysis Doc
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div id="analysis-presentation-content" className="space-y-8 bg-background p-1 rounded-md">
                    {/* Radar Comparison Chart */}
                    {radarChartData.length > 0 && (
                        <div id="radar-chart-container" className="rounded-md border p-6 bg-muted/10">
                            <h4 className="font-semibold text-lg mb-6 flex items-center gap-2">
                                <Bot className="h-5 w-5 text-primary" />
                                Multi-Criteria Evaluation Radar
                            </h4>
                            <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
                                <div className="w-full max-w-[500px] h-[400px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarChartData}>
                                            <PolarGrid stroke="#e2e8f0" />
                                            <PolarAngleAxis 
                                                dataKey="subject" 
                                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }} 
                                            />
                                            <PolarRadiusAxis 
                                                angle={30} 
                                                domain={[0, 100]} 
                                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                                                axisLine={false}
                                                tickCount={6}
                                            />
                                            <ChartTooltip 
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            />
                                            {Object.keys(radarChartConfig).map((name) => (
                                                <Radar
                                                    key={name}
                                                    name={name}
                                                    dataKey={name}
                                                    stroke={radarChartConfig[name].color}
                                                    fill={radarChartConfig[name].color}
                                                    fillOpacity={0.3}
                                                    strokeWidth={2}
                                                />
                                            ))}
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap lg:flex-col gap-4">
                                    {Object.keys(radarChartConfig).map((name) => {
                                        // Find the proposal for this supplier to get the final score
                                        const proposal = filteredProposals.find(p => `${suppliers.get(p.supplierId)?.companyName} rev ${p.revision ?? 0}` === name);
                                        const finalScore = proposal?.finalScore || 0;

                                        return (
                                            <div key={name} className="flex items-center justify-between gap-6 px-4 py-2 rounded-xl border bg-background shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: radarChartConfig[name].color }} />
                                                    <span className="text-xs font-bold truncate max-w-[120px]">{name}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-tighter">Final Score</span>
                                                    <span className="text-sm font-black text-primary">{finalScore.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Charts Section */}
                    {(priceChartData.length > 0 || scheduleChartData.length > 0) && (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-6 border-b">
                            {priceChartData.length > 0 && (
                            <div id="price-chart-container" className="rounded-md border p-4">
                                <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                                    <Bot className="h-5 w-5 text-primary" />
                                    Price Comparison
                                </h4>
                                <ChartContainer config={priceChartConfig} className="w-full h-[300px]">
                                    <BarChart data={priceChartData} accessibilityLayer>
                                        <CartesianGrid vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tickLine={false}
                                            tickMargin={10}
                                            axisLine={false}
                                            tickFormatter={(value) => value.slice(0, 15) + (value.length > 15 ? "..." : "")}
                                        />
                                        <YAxis
                                            tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="price" radius={4} label={{ position: 'top', formatter: (val: number) => `$${(val / 1000000).toFixed(1)}M`, fill: 'hsl(var(--foreground))', fontSize: 10 }}>
                                            {priceChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                        {rfp.budget > 0 && (
                                            <ReferenceLine 
                                                y={rfp.budget} 
                                                stroke="hsl(var(--destructive))" 
                                                strokeDasharray="3 3"
                                                label={{ 
                                                    value: `Budget: $${(rfp.budget / 1000000).toFixed(1)}M`, 
                                                    position: 'top',
                                                    fill: 'hsl(var(--destructive))',
                                                    fontSize: 12,
                                                    fontWeight: 'bold'
                                                }} 
                                            />
                                        )}
                                    </BarChart>
                                </ChartContainer>
                            </div>
                            )}

                            {scheduleChartData.length > 0 && (
                            <div id="schedule-chart-container" className="rounded-md border p-4">
                                <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                                    <ListChecks className="h-5 w-5 text-primary" />
                                    Execution Gantt Chart
                                </h4>
                                <ChartContainer config={scheduleChartConfig} className="w-full h-[300px]">
                                    <BarChart data={scheduleChartData} layout="vertical" margin={{ left: 20 }} accessibilityLayer>
                                        <CartesianGrid horizontal={false} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            tickLine={false}
                                            tickMargin={10}
                                            axisLine={false}
                                            tickFormatter={(value) => value.slice(0, 15) + (value.length > 15 ? "..." : "")}
                                        />
                                        <XAxis
                                            type="number"
                                            hide
                                        />
                                        <ChartTooltip content={
                                            <ChartTooltipContent
                                                formatter={(value: any, name, props) => {
                                                    const { payload } = props;
                                                    return (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="font-bold">{payload.name}</span>
                                                            <span>Start: {payload.startDate}</span>
                                                            <span>End: {payload.endDate}</span>
                                                            <span>Duration: {payload.duration} days</span>
                                                        </div>
                                                    )
                                                }}
                                            />
                                        } />
                                        <Bar dataKey="range" radius={4}>
                                            {scheduleChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                            <LabelList 
                                                dataKey="startDate" 
                                                position="insideLeft" 
                                                style={{ fill: '#fff', fontSize: 9, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }} 
                                            />
                                            <LabelList 
                                                dataKey="endDate" 
                                                position="insideRight" 
                                                style={{ fill: '#fff', fontSize: 9, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }} 
                                            />
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>
                            </div>
                            )}
                        </div>
                    )}

                    {/* Sectional Analysis */}
                    <div className="space-y-8">
                        {ANALYSIS_SECTIONS.map((section) => {
                            const Icon = section.icon;
                            const content = sectionsContent[section.id];
                            const isLoading = isLoadingSection === section.id;
                            const isSaving = isSavingSection === section.id;
                            const isCollapsed = collapsedSections.has(section.id);

                            return (
                                <div key={section.id} className="rounded-lg border bg-card shadow-sm overflow-hidden">
                                    <div
                                        className="bg-muted/30 px-4 py-3 border-b flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => toggleSection(section.id)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-primary/10 rounded-md">
                                                <Icon className="h-4 w-4 text-primary" />
                                            </div>
                                            <h4 className="font-bold text-base">{section.title}</h4>
                                            {content && (
                                                <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full font-medium">Generated</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-8 text-xs"
                                                onClick={() => handleRunSectionAnalysis(section.id, section.title)}
                                                disabled={!!isLoadingSection}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Bot className="mr-2 h-3.5 w-3.5" />
                                                )}
                                                Generate
                                            </Button>
                                            <Button 
                                                size="sm" 
                                                className="h-8 text-xs"
                                                onClick={() => handleSaveSection(section.id)}
                                                disabled={!content || !!isSavingSection}
                                            >
                                                {isSaving ? (
                                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Save className="mr-2 h-3.5 w-3.5" />
                                                )}
                                                Save
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleSection(section.id)}>
                                                {isCollapsed
                                                    ? <ChevronRight className="h-4 w-4" />
                                                    : <ChevronDown className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    {!isCollapsed && (
                                    <div className="p-4 bg-background min-h-[100px]">
                                        {content ? (
                                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml={true}>
                                                    {content}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                                                <p className="text-sm italic">No analysis generated for this section yet.</p>
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Backward compatibility: Show old summary if it exists and no sections are generated */}
                {rfp.aiAnalysisSummary && Object.keys(sectionsContent).length === 0 && (
                    <div className="mt-8 rounded-md border p-4 bg-muted/20">
                        <h4 className="font-semibold mb-2">Legacy Analysis Summary</h4>
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml={true}>
                                {rfp.aiAnalysisSummary}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}
            </CardContent>
            <StageCompletion stage="analysis" rfp={rfp} onUpdate={onStageUpdate} />
        </Card>
    );
};


// ─── Registry Tab ─────────────────────────────────────────────────────────────
const RegistryTab = ({
  rfp,
  onRfpUpdate,
  onStageUpdate,
  clientData,
}: {
  rfp: ClientRFP;
  onRfpUpdate: (updated: Partial<ClientRFP>) => void;
  onStageUpdate: (stages: string[], isCompleting: boolean) => void;
  clientData?: { name: string; logoUrl?: string | null } | null;
}) => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to safely format dates for display, preventing "Invalid time value" errors
  const safeFormatDate = (date: any, formatStr: string = 'PPP') => {
    if (!date) return 'Not set';
    try {
      const d = ensureDate(date);
      if (isNaN(d.getTime())) return 'Not set';
      return format(d, formatStr);
    } catch (e) {
      console.error('Error formatting date for display:', e);
      return 'Not set';
    }
  };

  // Helper to safely format dates for <input type="date" />
  const formatDateForInput = (date: any) => {
    if (!date) return '';
    try {
      // ensureIsoString handles Firestore Timestamps, Dates, and strings
      return ensureIsoString(date).slice(0, 10);
    } catch (e) {
      console.error('Error formatting date for input:', e);
      return '';
    }
  };

  // All editable fields
  const [title, setTitle] = useState(rfp.title);
  const [description, setDescription] = useState(rfp.description);
  const [budget, setBudget] = useState<number>(rfp.budget || 0);
  const [isConfidential, setIsConfidential] = useState(rfp.isConfidential || false);
  const [openDateStr, setOpenDateStr] = useState(formatDateForInput(rfp.openDate));
  const [closeDateStr, setCloseDateStr] = useState(formatDateForInput(rfp.closeDate));
  const [executionStartDateStr, setExecutionStartDateStr] = useState(formatDateForInput(rfp.executionStartDate));
  const [executionEndDateStr, setExecutionEndDateStr] = useState(formatDateForInput(rfp.executionEndDate));
  const [eoiDeadlineStr, setEoiDeadlineStr] = useState(formatDateForInput(rfp.eoiDeadline));
  const [procurementContact, setProcurementContact] = useState(rfp.procurementContact || { name: '', email: '', role: '', phone: '' });
  const [countryCode, setCountryCode] = useState(rfp.countryCode || '');
  const [stateCode, setStateCode] = useState(rfp.stateCode || '');
  const [cityName, setCityName] = useState(rfp.cityName || '');
  const [attachedFiles, setAttachedFiles] = useState(rfp.attachedFiles || []);

  // Client options
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState(rfp.clientId || '');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const qs = await getDocs(collection(db, 'clients'));
        setClients(qs.docs.map(d => ({ id: d.id, name: (d.data() as any).name })));
      } catch (e) { console.error(e); }
    };
    if (isEditing) fetchClients();
  }, [isEditing]);

  const openDate = ensureDate(rfp.openDate);
  const closeDate = ensureDate(rfp.closeDate);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const rfpRef = doc(db, 'rfps', rfp.id);
      const updates: Partial<ClientRFP> = {
        title,
        description,
        budget,
        isConfidential,
        openDate: openDateStr ? new Date(openDateStr).toISOString() : rfp.openDate,
        closeDate: closeDateStr ? new Date(closeDateStr).toISOString() : rfp.closeDate,
        executionStartDate: executionStartDateStr ? new Date(executionStartDateStr).toISOString() : undefined,
        executionEndDate: executionEndDateStr ? new Date(executionEndDateStr).toISOString() : undefined,
        eoiDeadline: eoiDeadlineStr ? new Date(eoiDeadlineStr).toISOString() : undefined,
        procurementContact,
        countryCode,
        stateCode,
        cityName,
        clientId,
        attachedFiles,
      };
      await updateDoc(rfpRef, updates);
      onRfpUpdate(updates);
      toast({ title: 'Registry updated', description: 'RFP details saved successfully.' });
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save RFP registry.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTitle(rfp.title);
    setDescription(rfp.description);
    setBudget(rfp.budget || 0);
    setIsConfidential(rfp.isConfidential || false);
    setOpenDateStr(formatDateForInput(rfp.openDate));
    setCloseDateStr(formatDateForInput(rfp.closeDate));
    setExecutionStartDateStr(formatDateForInput(rfp.executionStartDate));
    setExecutionEndDateStr(formatDateForInput(rfp.executionEndDate));
    setEoiDeadlineStr(formatDateForInput(rfp.eoiDeadline));
    setProcurementContact(rfp.procurementContact || { name: '', email: '', role: '', phone: '' });
    setCountryCode(rfp.countryCode || '');
    setStateCode(rfp.stateCode || '');
    setCityName(rfp.cityName || '');
    setClientId(rfp.clientId || '');
    setAttachedFiles(rfp.attachedFiles || []);
    setIsEditing(false);
  };

  const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="mt-0.5 p-1.5 bg-muted rounded-md shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <div className="mt-0.5 text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> RFP Registry
            </CardTitle>
            <CardDescription>All registration information for this RFP. {isAdmin && "Click Edit to make changes."}</CardDescription>
          </div>
          {isAdmin && (
            <Link to="/dashboard/templates" className="ml-4 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline group">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              Manage Templates
              <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}
        </div>
        {!isEditing && isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Edit className="mr-2 h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="reg-title">Title</Label>
                <Input id="reg-title" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-budget">Budget (USD)</Label>
                <Input id="reg-budget" type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-desc">Description</Label>
              <Textarea id="reg-desc" className="min-h-[100px]" value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="reg-open">Open Date</Label>
                <Input id="reg-open" type="date" value={openDateStr} onChange={e => setOpenDateStr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-close">Close Date</Label>
                <Input id="reg-close" type="date" value={closeDateStr} onChange={e => setCloseDateStr(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="reg-exec-start">Execution Start</Label>
                <Input id="reg-exec-start" type="date" value={executionStartDateStr} onChange={e => setExecutionStartDateStr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-exec-end">Execution End</Label>
                <Input id="reg-exec-end" type="date" value={executionEndDateStr} onChange={e => setExecutionEndDateStr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-eoi-deadline">EOI Deadline</Label>
                <Input id="reg-eoi-deadline" type="date" value={eoiDeadlineStr} onChange={e => setEoiDeadlineStr(e.target.value)} />
              </div>
            </div>

            <div className="border p-4 rounded-md space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> Procurement Contact Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="pc-name">Contact Name</Label>
                  <Input id="pc-name" value={procurementContact.name} onChange={e => setProcurementContact(prev => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-email">Contact Email</Label>
                  <Input id="pc-email" type="email" value={procurementContact.email} onChange={e => setProcurementContact(prev => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-role">Role/Position</Label>
                  <Input id="pc-role" value={procurementContact.role} onChange={e => setProcurementContact(prev => ({ ...prev, role: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-phone">Phone Number</Label>
                  <Input id="pc-phone" value={procurementContact.phone} onChange={e => setProcurementContact(prev => ({ ...prev, phone: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="reg-country">Country Code</Label>
                <Input id="reg-country" value={countryCode} onChange={e => setCountryCode(e.target.value)} placeholder="e.g. US" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-state">State Code</Label>
                <Input id="reg-state" value={stateCode} onChange={e => setStateCode(e.target.value)} placeholder="e.g. NY" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-city">City</Label>
                <Input id="reg-city" value={cityName} onChange={e => setCityName(e.target.value)} placeholder="e.g. New York City" />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reg-client">Client</Label>
              <select
                id="reg-client"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Select a client —</option>
                {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>

            <div className="flex items-center gap-3 py-1">
              <input
                id="reg-confidential"
                type="checkbox"
                checked={isConfidential}
                onChange={e => setIsConfidential(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Label htmlFor="reg-confidential">Confidential Customer</Label>
            </div>

            <div className="space-y-1">
              <Label>Attached Files</Label>
              <FileUpload
                value={attachedFiles}
                onChange={setAttachedFiles}
                folder={`rfps/${rfp.id}/documents`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {/* Left column */}
              <div className="space-y-1">
                <InfoRow icon={ClipboardList} label="Project Title" value={rfp.title} />
                <InfoRow icon={FileText} label="Description" value={rfp.description} />
                <InfoRow icon={DollarSign} label="Budget" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(rfp.budget || 0)} />
                <InfoRow icon={ShieldCheck} label="Confidentiality" value={rfp.isConfidential ? 'Confidential Customer (Hidden in emails)' : 'Standard'} />
                <InfoRow icon={Calendar} label="Open Date" value={safeFormatDate(rfp.openDate)} />
                <InfoRow icon={Calendar} label="Close Date" value={safeFormatDate(rfp.closeDate)} />
                <InfoRow icon={Clock} label="EOI Deadline" value={safeFormatDate(rfp.eoiDeadline)} />
                <InfoRow icon={Calendar} label="Execution Period" value={
                  rfp.executionStartDate && rfp.executionEndDate 
                    ? `${safeFormatDate(rfp.executionStartDate, 'MMM d, yyyy')} - ${safeFormatDate(rfp.executionEndDate, 'MMM d, yyyy')}`
                    : 'Not set'
                } />
              </div>
              {/* Right column */}
              <div className="space-y-1">
                <InfoRow
                  icon={UserCheck}
                  label="Client"
                  value={
                    <div className="flex items-center gap-2">
                      <CompanyLogo logoUrl={clientData?.logoUrl} name={clientData?.name || 'Client'} className="h-6 w-6" iconClassName="h-3 w-3" />
                      <span>{clientData?.name || (rfp.isConfidential ? 'Confidential Customer' : '—')}</span>
                    </div>
                  }
                />
                <InfoRow icon={MapPin} label="Location" value={`${rfp.cityName || '—'}, ${rfp.stateCode || '—'}, ${rfp.countryCode || '—'}`} />
                <InfoRow icon={ListChecks} label="Flow Type" value={<Badge variant="secondary" className="capitalize">{rfp.flowType}</Badge>} />
                
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <UserCheck className="h-4 w-4 text-primary" /> Procurement Contact
                  </h4>
                  <InfoRow icon={User} label="Name" value={rfp.procurementContact?.name || 'Not set'} />
                  <InfoRow icon={Mail} label="Email" value={rfp.procurementContact?.email || 'Not set'} />
                  <InfoRow icon={Briefcase} label="Role" value={rfp.procurementContact?.role || 'Not set'} />
                  <InfoRow icon={Phone} label="Phone" value={rfp.procurementContact?.phone || 'Not set'} />
                </div>

                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" /> Attached Files
                  </h4>
                  {rfp.attachedFiles && rfp.attachedFiles.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {rfp.attachedFiles.map((file, i) => (
                        <a
                          key={i}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded border bg-muted/30 hover:bg-muted/50 transition-colors text-xs overflow-hidden"
                        >
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-medium truncate">{file.name}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">No files attached</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <StageCompletion stage="registry" rfp={rfp} onUpdate={onStageUpdate} />
    </Card>
  );
};



type AwardSupplierRow = {
    supplierId: string;
    supplierName: string;
    contactName: string;
    contactEmail: string;
    proposalStatus?: string;
    totalPrice?: number;
    logoUrl?: string | null;
};
const AwardTab = ({ rfp, onUpdate, onRfpUpdate, onSendAwardClick, onSendNonAwardClick }: { 
    rfp: ClientRFP, 
    onUpdate: (stages: string[], isCompleting: boolean) => void,
    onRfpUpdate: (updatedRfp: Partial<ClientRFP>) => void,
    onSendAwardClick: (row: AwardSupplierRow) => void;
    onSendNonAwardClick: (row: AwardSupplierRow) => void;
}) => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [suppliers, setSuppliers] = useState<Map<string, Supplier>>(new Map());
    const [loading, setLoading] = useState(true);
    const [isSavingWinner, setIsSavingWinner] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
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
            } catch (error) {
                console.error("Error fetching award tab data:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to load proposal data for awarding.' });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [rfp.id, toast]);

    const awardSupplierRows = useMemo<AwardSupplierRow[]>(() => {
        return proposals.map(proposal => {
            const supplier = suppliers.get(proposal.supplierId);
            const primaryContact = supplier && Array.isArray(supplier.contacts) && supplier.contacts.length > 0 ? supplier.contacts[0] : undefined;
            return {
                supplierId: proposal.supplierId,
                supplierName: supplier?.companyName || 'Unknown Supplier',
                contactName: primaryContact?.name || 'N/A',
                contactEmail: primaryContact?.email || 'N/A',
                proposalStatus: proposal.status,
                totalPrice: proposal.price,
                logoUrl: supplier?.logoUrl,
            };
        });
    }, [proposals, suppliers]);

    const savingsMetrics = useMemo(() => {
        if (proposals.length === 0) return null;
        
        const winningProposal = proposals.find(p => p.supplierId === rfp.awardedSupplierId);
        const avgPrice = proposals.reduce((acc, p) => acc + p.price, 0) / proposals.length;
        
        const hardSavings = rfp.budget && winningProposal 
            ? rfp.budget - winningProposal.price 
            : null;
            
        const softSavings = winningProposal 
            ? avgPrice - winningProposal.price 
            : null;

        return {
            avgPrice,
            hardSavings,
            softSavings,
            winningPrice: winningProposal?.price
        };
    }, [proposals, rfp.awardedSupplierId, rfp.budget]);

    const handleSelectWinner = async (supplierId: string) => {
        setIsSavingWinner(true);
        try {
            const rfpRef = doc(db, 'rfps', rfp.id);
            await updateDoc(rfpRef, { awardedSupplierId: supplierId });
            logAudit({ action: 'rfp.awarded', category: 'rfp', targetCollection: 'rfps', targetDocId: rfp.id, clientId: rfp.clientId, details: { supplierName: suppliers.get(supplierId)?.companyName || supplierId, rfpTitle: rfp.title } });
            onRfpUpdate({ awardedSupplierId: supplierId });
            toast({
                title: 'Success',
                description: 'Winner selected successfully.',
            });
        } catch (error) {
            console.error('Error selecting winner:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to select winner.',
            });
        } finally {
            setIsSavingWinner(false);
        }
    };


    if (loading) {
        return <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />;
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">Award Contract</CardTitle>
                        <CardDescription>
                            Notify the successful and unsuccessful suppliers.
                        </CardDescription>
                    </div>
                    {savingsMetrics && (
                        <div className="flex gap-4">
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Hard Savings</p>
                                <p className={cn("text-lg font-bold", (savingsMetrics.hardSavings ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                                    {savingsMetrics.hardSavings !== null 
                                        ? savingsMetrics.hardSavings.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) 
                                        : 'N/A'}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Soft Savings</p>
                                <p className={cn("text-lg font-bold", (savingsMetrics.softSavings ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                                    {savingsMetrics.softSavings !== null 
                                        ? savingsMetrics.softSavings.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) 
                                        : 'N/A'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                 {awardSupplierRows.length > 0 ? (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {awardSupplierRows.map(row => (
                                    <TableRow key={row.supplierId} className={rfp.awardedSupplierId === row.supplierId ? "bg-primary/5" : ""}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <CompanyLogo logoUrl={row.logoUrl} name={row.supplierName} className="h-6 w-6" iconClassName="h-3 w-3" />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{row.supplierName}</span>
                                                    {rfp.awardedSupplierId === row.supplierId && (
                                                        <Badge variant="default" className="w-fit text-[10px] h-4 py-0 px-1 bg-green-500 hover:bg-green-600">
                                                            Winner
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-semibold">
                                                {(row.totalPrice || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs">
                                                <span>{row.contactName}</span>
                                                <span className="text-muted-foreground">{row.contactEmail}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            {rfp.awardedSupplierId !== row.supplierId ? (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => handleSelectWinner(row.supplierId)}
                                                    disabled={isSavingWinner}
                                                    className="border-green-500 text-green-600 hover:bg-green-50"
                                                >
                                                    {isSavingWinner ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                                    Set as Winner
                                                </Button>
                                            ) : (
                                                <Button variant="outline" size="sm" onClick={() => onSendAwardClick(row)}>
                                                    <Award className="mr-2 h-4 w-4" />
                                                    Send Award
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="sm" onClick={() => onSendNonAwardClick(row)} className="text-muted-foreground hover:text-destructive">
                                                <Mail className="mr-2 h-4 w-4" />
                                                Send Regret
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <FileUp className="mx-auto h-12 w-12" />
                        <p className="mt-4">No proposals have been submitted for this RFP yet.</p>
                    </div>
                )}
            </CardContent>
            <StageCompletion stage="award" rfp={rfp} onUpdate={onUpdate} />
        </Card>
    )
};

const PlaceholderTab = ({ title, stageKey, onStageUpdate, rfp }: { title: string; stageKey: string; onStageUpdate: (stages: string[], isCompleting: boolean) => void; rfp: ClientRFP; }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">This stage is under construction.</p>
            </CardContent>
            <StageCompletion stage={stageKey} rfp={rfp} onUpdate={onStageUpdate} />
        </Card>
    )
};


const TabTriggerWithCheck = ({ value, children, isComplete }: { value: string; children: React.ReactNode; isComplete: boolean }) => (
    <TabsTrigger value={value} className="flex items-center gap-2">
      {children}
      {isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
    </TabsTrigger>
);

async function loadTemplate(category: 'EOI' | 'RFP Invitation' | 'Award' | 'Non-Award'): Promise<RfpTemplateType | null> {
    const templatesRef = collection(db, "emailTemplates");
    const q = query(templatesRef, where("category", "==", category), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
  
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as RfpTemplateType;
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillTemplate(
  template: RfpTemplateType,
  ctx: TemplateContext
): { subject: string; body: string } {
  const replacements: Record<string, string> = {
    "[SUPPLIER_CONTACT_NAME]": ctx.supplierContactName,
    "[SUPPLIER_LEGAL_NAME]": ctx.supplierLegalName,
    "[SUPPLIER_EMAIL]": ctx.supplierEmail,
    "[PROJECT_NAME]": ctx.projectName,
    "[PACKAGE_NAME]": ctx.packageName,
    "[PROJECT_LOCATION]": ctx.projectLocation ?? "",
    "[CLIENT_NAME]": ctx.clientName ?? "",
    "[RFP_REFERENCE_ID]": ctx.rfpReferenceId ?? "",
    "[PORTAL_LINK]": ctx.portalLink ?? "",
    "[RFP_PORTAL_LINK]": ctx.portalLink ?? "",
    "[ACCESS_CODE]": ctx.accessCode ?? "",
    "[RFP_PORTAL_PASSWORD]": ctx.accessCode ?? "",
  };

  let subject = template.subject || "";
  let body = template.body || "";

  for (const [placeholder, value] of Object.entries(replacements)) {
    const regex = new RegExp(escapeRegExp(placeholder), "g");
    subject = subject.replace(regex, value || "");
    body = body.replace(regex, value || "");
  }

  return { subject, body };
}


type EmailModalState = {
  isOpen: boolean;
  toEmail: string;
  contactName: string;
  subject: string;
  body: string;
};


export function RfpDetailClient({ rfp: initialRfp }: { rfp: ClientRFP }) {
  const [rfp, setRfp] = useState(initialRfp);
  const { toast } = useToast();

  const [clientValue, clientLoading, clientError] = useDocument(
    rfp.clientId ? doc(db, 'clients', rfp.clientId) : null
  );
  const clientData = clientValue?.data() as Client | undefined;

  const [eoiTemplate, setEoiTemplate] = useState<RfpTemplateType | null>(null);
  const [isLoadingEoiTemplate, setIsLoadingEoiTemplate] = useState(false);
  const [eoiError, setEoiError] = useState<string | null>(null);
  const [eoiModal, setEoiModal] = useState<EmailModalState | null>(null);

  const [invitationTemplate, setInvitationTemplate] = useState<RfpTemplateType | null>(null);
  const [isLoadingInvitationTemplate, setIsLoadingInvitationTemplate] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationModal, setInvitationModal] = useState<EmailModalState | null>(null);

  const [awardTemplate, setAwardTemplate] = useState<RfpTemplateType | null>(null);
  const [isLoadingAwardTemplate, setIsLoadingAwardTemplate] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [awardModal, setAwardModal] = useState<EmailModalState | null>(null);

  const [nonAwardTemplate, setNonAwardTemplate] = useState<RfpTemplateType | null>(null);
  const [isLoadingNonAwardTemplate, setIsLoadingNonAwardTemplate] = useState(false);
  const [nonAwardError, setNonAwardError] = useState<string | null>(null);
  const [nonAwardModal, setNonAwardModal] = useState<EmailModalState | null>(null);

  const TABS_TO_RENDER = rfp.flowType === 'advanced' ? advanced_TABS : SIMPLE_TABS;

  const getInitialActiveTab = () => {
    const completed = initialRfp.completedStages || [];
    for (const tab of TABS_TO_RENDER) {
        if (!completed.includes(tab)) {
            return tab;
        }
    }
    return TABS_TO_RENDER[TABS_TO_RENDER.length - 1];
  };

  const [activeTab, setActiveTab] = useState(getInitialActiveTab());
  const openDate = useMemo(() => new Date(rfp.openDate), [rfp.openDate]);
  const closeDate = useMemo(() => new Date(rfp.closeDate), [rfp.closeDate]);
  const { user, loading } = useAuth();

  const handleRfpUpdate = (updatedRfp: Partial<ClientRFP>) => {
    setRfp(prevRfp => ({...prevRfp, ...updatedRfp}));
  };

  const handleSelectionSave = (ids: string[]) => {
    handleRfpUpdate({ selectedSupplierIds: ids });
  };
  
  const handleStageUpdate = (stages: string[], isCompleting: boolean) => {
    handleRfpUpdate({ completedStages: stages });
    if (isCompleting) {
      const currentTabIndex = TABS_TO_RENDER.indexOf(activeTab);
      if (currentTabIndex < TABS_TO_RENDER.length - 1) {
        setActiveTab(TABS_TO_RENDER[currentTabIndex + 1]);
      }
    }
  };

  const handleGoToEoi = () => {
    setActiveTab('eoi');
  };

  const handleSendEoiClick = async (supplier: Supplier) => {
    try {
      setEoiError(null);
      let template = eoiTemplate;
      if (!template) {
        setIsLoadingEoiTemplate(true);
        template = await loadTemplate('EOI');
        setIsLoadingEoiTemplate(false);
      }
  
      if (!template) {
        setEoiError("No EOI template found. Please create one in the Templates page.");
        toast({
          variant: 'destructive',
          title: 'Template not found',
          description: 'An "EOI" category email template is required.',
        });
        return;
      }
      
      const primaryContact = Array.isArray(supplier.contacts) && supplier.contacts.length > 0 ? supplier.contacts[0] : null;
      if (!primaryContact) {
         toast({
          variant: 'destructive',
          title: 'Supplier has no contacts',
          description: `Cannot send EOI to ${supplier.companyName}.`,
        });
        return;
      }
  
      const ctx: TemplateContext = {
        supplierContactName: primaryContact.name,
        supplierLegalName: supplier.companyName,
        supplierEmail: primaryContact.email,
        projectName: rfp.title,
        packageName: rfp.title, // Assuming project name and package name are the same
        projectLocation: `${rfp.cityName}, ${rfp.stateCode}`,
        clientName: rfp.isConfidential ? "Confidential Customer" : (clientData?.name || "advanced"),
        rfpReferenceId: rfp.id,
      };
  
      const filled = fillTemplate(template, ctx);
  
      const allContactEmails = supplier.contacts.map(c => c.email).join(', ');

      setEoiModal({
        isOpen: true,
        toEmail: allContactEmails,
        contactName: primaryContact.name,
        subject: filled.subject,
        body: filled.body,
      });
    } catch (err) {
      console.error("Error preparing EOI email", err);
      setEoiError("Failed to prepare the EOI email.");
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to prepare the EOI email.',
      });
    } finally {
      setIsLoadingEoiTemplate(false);
    }
  };

  const handleSendInvitationClick = async (supplier: Supplier) => {
    try {
      setInvitationError(null);
      let template = invitationTemplate;
      if (!template) {
        setIsLoadingInvitationTemplate(true);
        template = await loadTemplate('RFP Invitation');
        setInvitationTemplate(template);
        setIsLoadingInvitationTemplate(false);
      }
  
      if (!template) {
        setInvitationError("No RFP Invitation template found. Please create one in the Templates page.");
        toast({
          variant: 'destructive',
          title: 'Template not found',
          description: 'An "RFP Invitation" category email template is required.',
        });
        return;
      }
      
      const primaryContact = Array.isArray(supplier.contacts) && supplier.contacts.length > 0 ? supplier.contacts[0] : null;
      if (!primaryContact) {
         toast({
          variant: 'destructive',
          title: 'Supplier has no contacts',
          description: `Cannot send Invitation to ${supplier.companyName}.`,
        });
        return;
      }
  
      const code = rfp.supplierAccessCodes?.[supplier.id] || "";
      const portalLink = `${window.location.origin}/portal/${rfp.id}`;

      const ctx: TemplateContext = {
        supplierContactName: primaryContact.name,
        supplierLegalName: supplier.companyName,
        supplierEmail: primaryContact.email,
        projectName: rfp.title,
        packageName: rfp.title, 
        projectLocation: `${rfp.cityName}, ${rfp.stateCode}`,
        clientName: rfp.isConfidential ? "Confidential Customer" : (clientData?.name || "advanced"),
        rfpReferenceId: rfp.id,
        portalLink: portalLink,
        accessCode: code,
      };
  
      let { subject, body } = fillTemplate(template, ctx);

      // AI-powered placeholder substitution for custom [...] tags
      setIsLoadingInvitationTemplate(true);
      try {
        const aiResult = await fillEmailPlaceholders({
          rfpTitle: rfp.title,
          rfpDescription: rfp.description,
          rfpPrepData: rfp.advancedStages?.rfpPrep,
          subject,
          body,
        });
        subject = aiResult.subject;
        body = aiResult.body;
      } catch (aiError) {
        console.error("AI drafting failed, falling back to basic template:", aiError);
      } finally {
        setIsLoadingInvitationTemplate(false);
      }
  
      const allContactEmails = supplier.contacts.map(c => c.email).join(', ');

      setInvitationModal({
        isOpen: true,
        toEmail: allContactEmails,
        contactName: primaryContact.name,
        subject,
        body,
      });
    } catch (err) {
      console.error("Error preparing invitation email", err);
      setInvitationError("Failed to prepare the invitation email.");
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to prepare the invitation email.',
      });
    } finally {
      setIsLoadingInvitationTemplate(false);
    }
  };

  const handleSendAwardClick = async (row: AwardSupplierRow) => {
    try {
      setAwardError(null);
  
      let template = awardTemplate;
      if (!template) {
        setIsLoadingAwardTemplate(true);
        template = await loadTemplate("Award");
        setIsLoadingAwardTemplate(false);
        setAwardTemplate(template);
      }
      if (!template) {
        setAwardError("No Award email template found. Please create one in the Templates page.");
        toast({
            variant: 'destructive',
            title: 'Template not found',
            description: 'An "Award" category email template is required.',
        });
        return;
      }
  
      const ctx: TemplateContext = {
        supplierContactName: row.contactName,
        supplierLegalName: row.supplierName,
        supplierEmail: row.contactEmail,
        projectName: rfp.title,
        packageName: rfp.title,
        projectLocation: `${rfp.cityName}, ${rfp.stateCode}`,
        clientName: "advanced",
        rfpReferenceId: rfp.id,
      };
  
      const filled = fillTemplate(template, ctx);
  
      setAwardModal({
        isOpen: true,
        toEmail: row.contactEmail,
        contactName: row.contactName,
        subject: filled.subject,
        body: filled.body,
      });
    } catch (error) {
      console.error("Error preparing Award email", error);
      setAwardError("Failed to prepare the Award email.");
    } finally {
      setIsLoadingAwardTemplate(false);
    }
  };
  
  const handleSendNonAwardClick = async (row: AwardSupplierRow) => {
    try {
      setNonAwardError(null);
  
      let template = nonAwardTemplate;
      if (!template) {
        setIsLoadingNonAwardTemplate(true);
        template = await loadTemplate("Non-Award");
        setIsLoadingNonAwardTemplate(false);
        setNonAwardTemplate(template);
      }
      if (!template) {
        setNonAwardError("No Non-Award email template found. Please create one in the Templates page.");
        toast({
            variant: 'destructive',
            title: 'Template not found',
            description: 'A "Non-Award" category email template is required.',
        });
        return;
      }
  
      const ctx: TemplateContext = {
        supplierContactName: row.contactName,
        supplierLegalName: row.supplierName,
        supplierEmail: row.contactEmail,
        projectName: rfp.title,
        packageName: rfp.title,
        projectLocation: `${rfp.cityName}, ${rfp.stateCode}`,
        clientName: "advanced",
        rfpReferenceId: rfp.id,
      };
  
      const filled = fillTemplate(template, ctx);
  
      setNonAwardModal({
        isOpen: true,
        toEmail: row.contactEmail,
        contactName: row.contactName,
        subject: filled.subject,
        body: filled.body,
      });
    } catch (error) {
      console.error("Error preparing Non-Award email", error);
      setNonAwardError("Failed to prepare the Non-Award email.");
    } finally {
      setIsLoadingNonAwardTemplate(false);
    }
  };
  
  if (loading) {
    return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!user) {
    // This should ideally be handled by the layout, but as a fallback
    return <div className="text-center text-destructive">You must be logged in to view this page.</div>
  }

  const renderTabs = () => {
    if (rfp.flowType === 'advanced') {
      return (
        <TabsList className="grid w-full grid-cols-6 md:grid-cols-12">
          {advanced_TABS.map(tab => (
            <TabTriggerWithCheck key={tab} value={tab} isComplete={rfp.completedStages?.includes(tab) || false}>
                <span className="text-[10px] xl:text-xs">{advanced_TABS_CONFIG[tab].label}</span>
            </TabTriggerWithCheck>
          ))}
        </TabsList>
      )
    }

    // Default to simple flow
    return (
        <TabsList className="grid w-full grid-cols-5 md:grid-cols-9">
        {SIMPLE_TABS.map(tab => {
            const config = SIMPLE_TABS_CONFIG[tab];
            const Icon = config.icon;
            return (
            <TabTriggerWithCheck key={tab} value={tab} isComplete={rfp.completedStages?.includes(tab) || false}>
                <Icon className="mr-1 h-3.5 w-3.5" />
                <span className="text-xs">{config.label}</span>
            </TabTriggerWithCheck>
            )
        })}
        </TabsList>
    );
  };
  
  const renderTabContent = (tab: string) => {
    switch(tab) {
        // Simple Flow Tabs
        case 'registry': return <RegistryTab rfp={rfp} onRfpUpdate={handleRfpUpdate} onStageUpdate={handleStageUpdate} clientData={clientData} />;
        case 'selection': return <SelectionTab rfp={rfp} onSelectionSave={handleSelectionSave} onSaveSuccess={handleGoToEoi} onStageUpdate={handleStageUpdate} />;

        case 'eoi': return <EoiTab rfp={rfp} onStageUpdate={handleStageUpdate} onSendEoiClick={handleSendEoiClick} />;
        case 'documents': return <RfDocumentsTab rfp={rfp} onStageUpdate={handleStageUpdate} />;
        case 'invitation': return <InvitationTab rfp={rfp} onStageUpdate={handleStageUpdate} onSendInvitationClick={handleSendInvitationClick} onRfpUpdate={handleRfpUpdate} />;
        case 'questions': return <QuestionsTab rfp={rfp} onStageUpdate={handleStageUpdate} />;
        case 'proposals': return <ProposalsTab rfp={rfp} onStageUpdate={handleStageUpdate}/>;
        case 'analysis': return <AnalysisTab rfp={rfp} onRfpUpdate={handleRfpUpdate} onStageUpdate={handleStageUpdate} clientData={clientData} />;
        case 'award': return <AwardTab rfp={rfp} onUpdate={handleStageUpdate} onRfpUpdate={handleRfpUpdate} onSendAwardClick={handleSendAwardClick} onSendNonAwardClick={handleSendNonAwardClick} />;

        // advanced Flow Tabs
        case 'prequalification': return <SupplierPrequalificationSection rfp={rfp as unknown as RFP} stageKey={tab} onStageUpdate={handleStageUpdate} />;
        case 'rfp-preparation': return <RfpPrepStage rfp={rfp as unknown as RFP} onUpdate={handleRfpUpdate as any} onStageUpdate={handleStageUpdate} />;
        case 'bid': return <BidStage rfp={rfp as unknown as RFP} onUpdate={handleRfpUpdate as any} onStageUpdate={handleStageUpdate} />;
        case 'initial-bid-analysis': return <BidAnalysisStage rfp={rfp as unknown as RFP} onUpdate={handleRfpUpdate as any} onStageUpdate={handleStageUpdate} />;

        // Default placeholder for other advanced tabs
        default: 
            const config = advanced_TABS_CONFIG[tab];
            if (config) {
                return <PlaceholderTab title={config.label} stageKey={tab} rfp={rfp} onStageUpdate={handleStageUpdate} />;
            }
            return null;
    }
  }


  return (
    <div className="container mx-auto py-2">
       <div className="mb-4 flex items-center gap-4">
        <CompanyLogo logoUrl={clientData?.logoUrl} name={clientData?.name || 'Client'} className="h-14 w-14 border-primary/20 shadow-sm" iconClassName="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{rfp.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {clientData && (
              <span className="flex items-center gap-1 font-semibold text-primary">
                {clientData.name}
              </span>
            )}
            <span>
              Status:{' '}
              <span className="font-semibold text-primary">{rfp.status}</span>
            </span>
            <span>
              Opens:{' '}
              <span className="font-semibold text-primary">
                {format(openDate, 'MMM d, yyyy')}
              </span>
            </span>
            <span>
              Closes:{' '}
              <span className="font-semibold text-primary">
                {format(closeDate, 'MMM d, yyyy')}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <NotesButton entityType="rfp" entityId={rfp.id} entityName={rfp.title} />
          <Button asChild variant="outline">
              <Link to="/dashboard/rfps">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to RFP List
              </Link>
          </Button>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {renderTabs()}
        {TABS_TO_RENDER.map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
                {renderTabContent(tab)}
            </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!eoiModal?.isOpen} onOpenChange={(open) => {
        if (!open) setEoiModal(null);
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Send EOI to {eoiModal?.contactName}</DialogTitle>
            <DialogDescription>
              Review the email content below. You can copy it to your clipboard or open it directly in your default email client.
            </DialogDescription>
          </DialogHeader>

          {isLoadingEoiTemplate ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : null}
          {eoiError && <p className="text-sm text-destructive">{eoiError}</p>}
          
          {eoiModal && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="eoi-to">To</Label>
                <Input id="eoi-to" value={eoiModal.toEmail} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eoi-subject">Subject</Label>
                <Input
                  id="eoi-subject"
                  value={eoiModal.subject}
                  onChange={(e) =>
                    setEoiModal((prev) => prev ? { ...prev, subject: e.target.value } : prev)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eoi-body">Body</Label>
                <Textarea
                  id="eoi-body"
                  className="min-h-[250px] font-mono text-xs"
                  value={eoiModal.body}
                  onChange={(e) =>
                    setEoiModal((prev) => prev ? { ...prev, body: e.target.value } : prev)
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter className="justify-between sm:justify-between">
             <Button
                type="button"
                variant="ghost"
                onClick={() => setEoiModal(null)}
              >
                Close
              </Button>
            <div className="flex gap-2">
              {eoiModal && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(eoiModal.body).then(() => {
                        toast({ title: "Copied!", description: "The email body has been copied to your clipboard." });
                      }).catch(console.error);
                    }}
                  >
                    <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Body
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => {
                      const mailto = `mailto:${encodeURIComponent(eoiModal.toEmail)}?subject=${encodeURIComponent(
                        eoiModal.subject
                      )}&body=${encodeURIComponent(eoiModal.body)}`;
                      window.location.href = mailto;
                    }}
                  >
                    <Mailbox className="mr-2 h-4 w-4" /> Open in Email Client
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invitationModal?.isOpen} onOpenChange={(open) => {
        if (!open) setInvitationModal(null);
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Send RFP Invitation to {invitationModal?.contactName}</DialogTitle>
            <DialogDescription>
              Review the email content below. You can copy it to your clipboard or open it directly in your default email client.
            </DialogDescription>
          </DialogHeader>

          {isLoadingInvitationTemplate ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : null}
          {invitationError && <p className="text-sm text-destructive">{invitationError}</p>}
          
          {invitationModal && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="inv-to">To</Label>
                <Input id="inv-to" value={invitationModal.toEmail} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-subject">Subject</Label>
                <Input
                  id="inv-subject"
                  value={invitationModal.subject}
                  onChange={(e) =>
                    setInvitationModal((prev) => prev ? { ...prev, subject: e.target.value } : prev)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-body">Body</Label>
                <Textarea
                  id="inv-body"
                  className="min-h-[250px] font-mono text-xs"
                  value={invitationModal.body}
                  onChange={(e) =>
                    setInvitationModal((prev) => prev ? { ...prev, body: e.target.value } : prev)
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter className="justify-between sm:justify-between">
             <Button
                type="button"
                variant="ghost"
                onClick={() => setInvitationModal(null)}
              >
                Close
              </Button>
            <div className="flex gap-2">
              {invitationModal && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(invitationModal.body).then(() => {
                        toast({ title: "Copied!", description: "The email body has been copied to your clipboard." });
                      }).catch(console.error);
                    }}
                  >
                    <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Body
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => {
                      const mailto = `mailto:${encodeURIComponent(invitationModal.toEmail)}?subject=${encodeURIComponent(
                        invitationModal.subject
                      )}&body=${encodeURIComponent(invitationModal.body)}`;
                      window.location.href = mailto;
                    }}
                  >
                    <Mailbox className="mr-2 h-4 w-4" /> Open in Email Client
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       <Dialog open={!!awardModal?.isOpen} onOpenChange={(open) => { if (!open) setAwardModal(null); }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Send Award Notification to {awardModal?.contactName}</DialogTitle>
                    <DialogDescription>
                        Review the email content below. You can copy it or open it in your email client.
                    </DialogDescription>
                </DialogHeader>
                {isLoadingAwardTemplate && <Loader2 className="mx-auto h-8 w-8 animate-spin" />}
                {awardError && <p className="text-sm text-destructive">{awardError}</p>}
                {awardModal && (
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="award-to">To</Label>
                            <Input id="award-to" value={awardModal.toEmail} readOnly />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="award-subject">Subject</Label>
                            <Input id="award-subject" value={awardModal.subject} onChange={(e) => setAwardModal(prev => prev ? { ...prev, subject: e.target.value } : null)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="award-body">Body</Label>
                            <Textarea id="award-body" className="min-h-[250px] font-mono text-xs" value={awardModal.body} onChange={(e) => setAwardModal(prev => prev ? { ...prev, body: e.target.value } : null)} />
                        </div>
                    </div>
                )}
                <DialogFooter className="justify-between sm:justify-between">
                    <Button type="button" variant="ghost" onClick={() => setAwardModal(null)}>Close</Button>
                    <div className="flex gap-2">
                        {awardModal && (
                            <>
                                <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(awardModal.body).then(() => toast({ title: "Copied!" })).catch(() => {}); }}>
                                    <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Body
                                </Button>
                                <Button type="button" size="sm" onClick={() => { window.location.href = `mailto:${encodeURIComponent(awardModal.toEmail)}?subject=${encodeURIComponent(awardModal.subject)}&body=${encodeURIComponent(awardModal.body)}`; }}>
                                    <Mailbox className="mr-2 h-4 w-4" /> Open in Email Client
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={!!nonAwardModal?.isOpen} onOpenChange={(open) => { if (!open) setNonAwardModal(null); }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Send Non-Award Notification to {nonAwardModal?.contactName}</DialogTitle>
                    <DialogDescription>
                        Review the email content below. You can copy it or open it in your email client.
                    </DialogDescription>
                </DialogHeader>
                {isLoadingNonAwardTemplate && <Loader2 className="mx-auto h-8 w-8 animate-spin" />}
                {nonAwardError && <p className="text-sm text-destructive">{nonAwardError}</p>}
                {nonAwardModal && (
                     <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="non-award-to">To</Label>
                            <Input id="non-award-to" value={nonAwardModal.toEmail} readOnly />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="non-award-subject">Subject</Label>
                            <Input id="non-award-subject" value={nonAwardModal.subject} onChange={(e) => setNonAwardModal(prev => prev ? { ...prev, subject: e.target.value } : null)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="non-award-body">Body</Label>
                            <Textarea id="non-award-body" className="min-h-[250px] font-mono text-xs" value={nonAwardModal.body} onChange={(e) => setNonAwardModal(prev => prev ? { ...prev, body: e.target.value } : null)} />
                        </div>
                    </div>
                )}
                <DialogFooter className="justify-between sm:justify-between">
                    <Button type="button" variant="ghost" onClick={() => setNonAwardModal(null)}>Close</Button>
                    <div className="flex gap-2">
                        {nonAwardModal && (
                            <>
                                <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(nonAwardModal.body).then(() => toast({ title: "Copied!" })).catch(() => {}); }}>
                                    <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Body
                                </Button>
                                <Button type="button" size="sm" onClick={() => { window.location.href = `mailto:${encodeURIComponent(nonAwardModal.toEmail)}?subject=${encodeURIComponent(nonAwardModal.subject)}&body=${encodeURIComponent(nonAwardModal.body)}`; }}>
                                    <Mailbox className="mr-2 h-4 w-4" /> Open in Email Client
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
