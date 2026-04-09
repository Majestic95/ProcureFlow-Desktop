import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, Workflow, FileText } from 'lucide-react';
import { columns } from '@/components/rfps/columns';
import { DataTable } from '@/components/rfps/data-table';
import type { RFP, RfpFlowType } from '@/types';
import { collection, query, onSnapshot } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo, useState, useEffect } from 'react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';


const safeToDate = (date: any): Date => {
  if (!date) return new Date();
  if (typeof date.toDate === 'function') return date.toDate();
  if (date instanceof Date) return date;
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getRFPStage = (rfp: RFP): string => {
  if (rfp.status === 'draft') return 'Draft';
  if (rfp.status === 'closed') return 'Closed';

  const now = new Date();
  const openDate = safeToDate(rfp.openDate);
  const closeDate = safeToDate(rfp.closeDate);

  if (now < openDate) {
    return 'Supplier Selection';
  }
  if (now >= openDate && now <= closeDate) {
    return 'Accepting Proposals';
  }
  if (now > closeDate) {
    return 'Evaluation';
  }
  
  return 'Published';
};

export default function RFPsPage() {
  const [data, setData] = useState<RFP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFlowDialogOpen, setIsFlowDialogOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<RfpFlowType>('simple');
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  // Fetch projects for name lookup
  useEffect(() => {
    const q = query(collection(db, 'projects'));
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data().name; });
      setProjectMap(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'rfps'));
    const unsubscribe = onSnapshot(q,
      (querySnapshot) => {
        const rfps = querySnapshot.docs.map((doc) => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...docData,
            flowType: docData.flowType || 'simple', // Default to simple for old RFPs
            openDate: safeToDate(docData.openDate),
            closeDate: safeToDate(docData.closeDate),
            createdAt: safeToDate(docData.createdAt),
          } as RFP;
        });
        setData(rfps);
        setLoading(false);
      },
      (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'rfps',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setError(serverError);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleContinue = () => {
    setIsFlowDialogOpen(false);
    if (selectedFlow === 'advanced') {
      navigate('/dashboard/rfps/new-advanced');
    } else {
      navigate('/dashboard/rfps/new');
    }
  };

  // Enrich RFPs with project names
  const enrichedData = useMemo(() => {
    return data.map(rfp => ({
      ...rfp,
      _projectName: rfp.projectId ? projectMap[rfp.projectId] || undefined : undefined,
    }));
  }, [data, projectMap]);

  const filteredData = (stage: string) => {
    if (stage === 'all') return enrichedData;
    if (stage === 'draft') return enrichedData.filter(rfp => rfp.status === 'draft');
    if (stage === 'closed') return enrichedData.filter(rfp => rfp.status === 'closed');
    return enrichedData.filter((rfp) => getRFPStage(rfp) === stage);
  };
  
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    // The contextual error will be thrown by the FirebaseErrorListener,
    // but we can still show a fallback UI here.
    return (
      <div className="container mx-auto py-10 text-center">
        <h2 className="text-xl font-semibold text-destructive">
          Permission Denied
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          You do not have permission to view the list of RFPs.
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Error: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Request for Proposals (RFPs)
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage all your ongoing and past RFPs.
          </p>
        </div>
        <Button onClick={() => setIsFlowDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create RFP
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="Supplier Selection">Selection</TabsTrigger>
          <TabsTrigger value="Accepting Proposals">Accepting</TabsTrigger>
          <TabsTrigger value="Evaluation">Evaluation</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <DataTable columns={columns} data={filteredData('all')} />
        </TabsContent>
        <TabsContent value="Supplier Selection">
          <DataTable columns={columns} data={filteredData('Supplier Selection')} />
        </TabsContent>
        <TabsContent value="Accepting Proposals">
          <DataTable columns={columns} data={filteredData('Accepting Proposals')} />
        </TabsContent>
        <TabsContent value="Evaluation">
          <DataTable columns={columns} data={filteredData('Evaluation')} />
        </TabsContent>
        <TabsContent value="closed">
          <DataTable columns={columns} data={filteredData('closed')} />
        </TabsContent>
      </Tabs>

      <Dialog open={isFlowDialogOpen} onOpenChange={setIsFlowDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Choose RFP Flow</DialogTitle>
            <DialogDescription className="text-xs">
              Select which process you want to use for this new RFP.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={selectedFlow} onValueChange={(value) => setSelectedFlow(value as RfpFlowType)} className="grid grid-cols-1 gap-4 py-4">
            <Label htmlFor="flow-simple" className={cn("flex flex-col items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all", selectedFlow === 'simple' && 'border-primary ring-2 ring-primary')}>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="simple" id="flow-simple" />
                <div className="font-semibold text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Simple Flow</div>
              </div>
              <p className="text-xs text-muted-foreground ml-7">Quick setup with a straightforward set of fields. Ideal for standard, less complex RFPs.</p>
            </Label>
             <Label htmlFor="flow-advanced" className={cn("flex flex-col items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all", selectedFlow === 'advanced' && 'border-primary ring-2 ring-primary')}>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="advanced" id="flow-advanced" />
                <div className="font-semibold text-sm flex items-center gap-2"><Workflow className="h-4 w-4" />advanced Flow</div>
              </div>
              <p className="text-xs text-muted-foreground ml-7">A structured process that follows the full advanced RFP methodology, from strategy to award.</p>
            </Label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFlowDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleContinue}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
