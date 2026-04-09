import { useState, useEffect, useMemo, useCallback } from 'react';
import type { PackageContract, ContractTerm, EquipmentPackage } from '@/types';
import { CONTRACT_TERM_KEYS } from '@/types';
import { db } from '@/lib/firebase';
import {
  collection, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, FieldValue,
} from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { CONTRACT_TERM_COLORS } from '@/lib/colors';
import { ensureDate } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContractsTabProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TermStatus = 'complete' | 'incomplete' | 'na';

function statusLabel(s: TermStatus): string {
  if (s === 'na') return 'N/A';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildDefaultTerms(): ContractTerm[] {
  return CONTRACT_TERM_KEYS.map((t) => ({
    key: t.key,
    label: t.label,
    status: 'incomplete' as const,
    notes: '',
  }));
}

// ---------------------------------------------------------------------------
// Term Row
// ---------------------------------------------------------------------------

interface TermRowProps {
  term: ContractTerm;
  canEdit: boolean;
  onStatusChange: (key: string, status: TermStatus) => void;
  onNotesChange: (key: string, notes: string) => void;
}

function TermRow({ term, canEdit, onStatusChange, onNotesChange }: TermRowProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(term.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);

  // Sync local notes when term prop changes (only if user hasn't made unsaved edits)
  // When dirty and Firestore confirms our save (term.notes matches localNotes), clear dirty flag
  useEffect(() => {
    if (!notesDirty) setLocalNotes(term.notes || '');
    if (notesDirty && (term.notes || '') === localNotes) setNotesDirty(false);
  }, [term.notes, notesDirty, localNotes]);

  const handleNotesBlur = useCallback(() => {
    if (localNotes !== (term.notes || '')) {
      onNotesChange(term.key, localNotes);
      // notesDirty stays true until Firestore confirms (term.notes matches localNotes in useEffect)
    } else {
      setNotesDirty(false);
    }
  }, [localNotes, term.notes, term.key, onNotesChange]);

  const lastUpdated = term.lastUpdated
    ? ensureDate(term.lastUpdated).toLocaleDateString()
    : null;

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium text-sm flex-1 min-w-[140px]">{term.label}</span>

        <Badge className={CONTRACT_TERM_COLORS[term.status] || ''} variant="secondary">
          {statusLabel(term.status as TermStatus)}
        </Badge>

        {canEdit ? (
          <Select
            value={term.status}
            onValueChange={(v) => onStatusChange(term.key, v as TermStatus)}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="na">N/A</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1"
          onClick={() => setNotesOpen((o) => !o)}
        >
          {notesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Notes
        </Button>

        {lastUpdated && (
          <span className="text-xs text-muted-foreground ml-auto">Updated {lastUpdated}</span>
        )}
      </div>

      {notesOpen && (
        <Textarea
          value={localNotes}
          onChange={(e) => { setLocalNotes(e.target.value); setNotesDirty(true); }}
          onBlur={handleNotesBlur}
          placeholder="Add notes..."
          disabled={!canEdit}
          className="text-sm min-h-[60px]"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ContractsTab({ projectId, clientId, packages, canEdit }: ContractsTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [contracts, setContracts] = useState<PackageContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState<string | null>(null);

  // ---- Real-time listener ----
  useEffect(() => {
    const colRef = collection(db, 'projects', projectId, 'contracts');
    const unsub = onSnapshot(colRef, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PackageContract));
      setContracts(data);
      setLoading(false);
    }, () => {
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  // ---- Contract lookup by packageId ----
  const contractByPkg = useMemo(() => {
    const map = new Map<string, PackageContract>();
    contracts.forEach((c) => map.set(c.packageId, c));
    return map;
  }, [contracts]);

  // ---- Summary stats ----
  const summary = useMemo(() => {
    let totalTerms = 0;
    let completeTerms = 0;
    contracts.forEach((c) => {
      c.terms.forEach((t) => {
        if (t.status !== 'na') totalTerms++;
        if (t.status === 'complete') completeTerms++;
      });
    });
    const pct = totalTerms > 0 ? Math.round((completeTerms / totalTerms) * 100) : 0;
    return {
      packagesWithContracts: contracts.length,
      totalPackages: packages.length,
      completeTerms,
      totalTerms,
      pct,
    };
  }, [contracts, packages.length]);

  // ---- Initialize contract ----
  const handleInitialize = useCallback(async (pkg: EquipmentPackage) => {
    setInitializing(pkg.id);
    try {
      const docRef = doc(collection(db, 'projects', projectId, 'contracts'));
      const newContract: Omit<PackageContract, 'id' | 'createdAt' | 'updatedAt'> & { createdAt: FieldValue; updatedAt: FieldValue } = {
        packageId: pkg.id,
        packageName: pkg.name,
        supplierName: pkg.awardedSupplierName || '',
        terms: buildDefaultTerms(),
        createdBy: user?.uid || 'unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(docRef, newContract);
      await logAudit({
        action: 'contract.initialized',
        category: 'client',
        targetCollection: `projects/${projectId}/contracts`,
        targetDocId: docRef.id,
        clientId,
        details: { packageId: pkg.id, packageName: pkg.name },
      });
      toast({ title: 'Contract initialized', description: `Contract created for ${pkg.name}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setInitializing(null);
    }
  }, [projectId, clientId, user, toast]);

  // ---- Update a single term ----
  const handleTermUpdate = useCallback(async (
    contract: PackageContract,
    key: string,
    patch: Partial<ContractTerm>,
  ) => {
    const updatedTerms = contract.terms.map((t) =>
      t.key === key ? { ...t, ...patch, lastUpdated: new Date() } : t,
    );
    const docRef = doc(db, 'projects', projectId, 'contracts', contract.id);
    try {
      await updateDoc(docRef, { terms: updatedTerms, updatedAt: serverTimestamp() });
      await logAudit({
        action: 'contract.term_updated',
        category: 'client',
        targetCollection: `projects/${projectId}/contracts`,
        targetDocId: contract.id,
        clientId,
        details: { packageId: contract.packageId, termKey: key, ...patch },
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }, [projectId, clientId, toast]);

  // ---- Completion helpers ----
  function countComplete(terms: ContractTerm[]) {
    const applicable = terms.filter((t) => t.status !== 'na');
    const done = applicable.filter((t) => t.status === 'complete');
    return { done: done.length, total: applicable.length };
  }

  // ---- Loading ----
  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading contracts...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Packages with Contracts"
          value={`${summary.packagesWithContracts} / ${summary.totalPackages}`}
        />
        <SummaryCard
          label="Terms Complete"
          value={`${summary.completeTerms} / ${summary.totalTerms}`}
        />
        <SummaryCard label="Overall Completion" value={`${summary.pct}%`} />
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Overall Progress</p>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${summary.pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Package contracts */}
      <Accordion type="multiple" className="space-y-2">
        {packages.map((pkg) => {
          const contract = contractByPkg.get(pkg.id);

          if (!contract) {
            return (
              <div key={pkg.id} className="border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground">No contract initialized</p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={initializing === pkg.id}
                    onClick={() => handleInitialize(pkg)}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    {initializing === pkg.id ? 'Initializing...' : 'Initialize Contract'}
                  </Button>
                )}
              </div>
            );
          }

          const { done, total } = countComplete(contract.terms);
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <AccordionItem key={contract.id} value={contract.id}>
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-4 flex-1 text-left">
                  <span className="font-medium text-sm">{contract.packageName}</span>
                  {contract.supplierName && (
                    <span className="text-xs text-muted-foreground">{contract.supplierName}</span>
                  )}
                  <Badge variant="secondary" className="ml-auto mr-4 text-xs">
                    {done}/{total} complete
                  </Badge>
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                {contract.terms.map((term) => (
                  <TermRow
                    key={term.key}
                    term={term}
                    canEdit={canEdit}
                    onStatusChange={(k, s) => handleTermUpdate(contract, k, { status: s })}
                    onNotesChange={(k, n) => handleTermUpdate(contract, k, { notes: n })}
                  />
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
