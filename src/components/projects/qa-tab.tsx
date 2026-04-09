import { useState, useEffect, useMemo } from 'react';
import type { ProjectQuestion, QuestionStatus, EquipmentPackage } from '@/types';
import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp,
} from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { QUESTION_STATUS_COLORS } from '@/lib/colors';
import { ensureDate } from '@/lib/utils';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Search, MessageSquareText } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QaTabProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Filter type
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'open' | 'closed';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QaTab({ projectId, clientId, packages, canEdit }: QaTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Data
  const [questions, setQuestions] = useState<ProjectQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectQuestion | null>(null);

  // Create form
  const [fQuestion, setFQuestion] = useState('');
  const [fAsker, setFAsker] = useState('');
  const [fOwner, setFOwner] = useState('');
  const [fPackageId, setFPackageId] = useState('');
  const [fVendor, setFVendor] = useState('');

  // Detail form edits
  const [dResponse, setDResponse] = useState('');
  const [dAnsweredBy, setDAnsweredBy] = useState('');
  const [dNotes, setDNotes] = useState('');

  // Real-time listener
  useEffect(() => {
    const colRef = collection(db, 'projects', projectId, 'questions');
    const unsub = onSnapshot(colRef, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectQuestion));
      items.sort((a, b) => a.index - b.index);
      setQuestions(items);
      setLoading(false);
    }, (err) => { console.error('[QaTab] listener error:', err); });
    return () => unsub();
  }, [projectId]);

  // Filtered list
  const counts = useMemo(() => ({
    all: questions.length,
    open: questions.filter((q) => q.status === 'open').length,
    closed: questions.filter((q) => q.status === 'closed').length,
  }), [questions]);

  const filtered = useMemo(() => {
    let list = questions;
    if (filterTab !== 'all') list = list.filter((q) => q.status === filterTab);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((q) =>
        q.question.toLowerCase().includes(s) ||
        q.asker.toLowerCase().includes(s) ||
        q.owner.toLowerCase().includes(s),
      );
    }
    return list;
  }, [questions, filterTab, search]);

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  function resetCreateForm() {
    setFQuestion(''); setFAsker(''); setFOwner(''); setFPackageId(''); setFVendor('');
  }

  async function handleCreate() {
    if (!fQuestion.trim() || !fAsker.trim() || !fOwner.trim()) return;
    const pkg = packages.find((p) => p.id === fPackageId);
    const newIndex = questions.length > 0 ? Math.max(...questions.map(q => q.index)) + 1 : 1;
    try {
      const docRef = await addDoc(collection(db, 'projects', projectId, 'questions'), {
        index: newIndex,
        status: 'open' as QuestionStatus,
        dateOpened: serverTimestamp(),
        asker: fAsker.trim(),
        owner: fOwner.trim(),
        question: fQuestion.trim(),
        ...(fPackageId && { packageId: fPackageId, packageName: pkg?.name || '' }),
        ...(fVendor.trim() && { vendorName: fVendor.trim() }),
        createdBy: user?.uid || 'unknown',
        createdAt: serverTimestamp(),
      });
      await logAudit({
        action: 'question.created', category: 'client',
        targetCollection: `projects/${projectId}/questions`, targetDocId: docRef.id,
        clientId, details: { index: newIndex, asker: fAsker.trim() },
      });
      toast({ title: 'Question created' });
      resetCreateForm();
      setCreateOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  // ---------------------------------------------------------------------------
  // Detail open
  // ---------------------------------------------------------------------------

  function openDetail(q: ProjectQuestion) {
    setSelected(q);
    setDResponse(q.response || '');
    setDAnsweredBy(q.answeredBy || '');
    setDNotes(q.notes || '');
    setDetailOpen(true);
  }

  // ---------------------------------------------------------------------------
  // Save response
  // ---------------------------------------------------------------------------

  async function handleSaveResponse() {
    if (!selected) return;
    try {
      const ref = doc(db, 'projects', projectId, 'questions', selected.id);
      await updateDoc(ref, {
        response: dResponse.trim(),
        answeredBy: dAnsweredBy.trim(),
        notes: dNotes.trim(),
      });
      await logAudit({
        action: 'question.answered', category: 'client',
        targetCollection: `projects/${projectId}/questions`, targetDocId: selected.id,
        clientId, details: { answeredBy: dAnsweredBy.trim() },
      });
      toast({ title: 'Response saved' });
      setDetailOpen(false);
      setSelected(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  // ---------------------------------------------------------------------------
  // Close question
  // ---------------------------------------------------------------------------

  async function handleClose() {
    if (!selected) return;
    try {
      const ref = doc(db, 'projects', projectId, 'questions', selected.id);
      await updateDoc(ref, { status: 'closed', dateClosed: serverTimestamp() });
      await logAudit({
        action: 'question.closed', category: 'client',
        targetCollection: `projects/${projectId}/questions`, targetDocId: selected.id,
        clientId, details: { index: selected.index },
      });
      toast({ title: 'Question closed' });
      setDetailOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' },
  ];

  if (loading) return <div className="p-6 text-muted-foreground">Loading questions...</div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={filterTab === t.key ? 'default' : 'outline'}
            onClick={() => setFilterTab(t.key)}
          >
            {t.label} ({counts[t.key]})
          </Button>
        ))}

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-56"
          />
        </div>

        {canEdit && (
          <Button size="sm" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Question
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-28">Date Opened</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Asker</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="min-w-[200px]">Question</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No questions found.
                </TableCell>
              </TableRow>
            ) : filtered.map((q) => (
              <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(q)}>
                <TableCell className="font-mono">{q.index}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={QUESTION_STATUS_COLORS[q.status]}>
                    {q.status}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {ensureDate(q.dateOpened).toLocaleDateString()}
                </TableCell>
                <TableCell>{q.packageName || '-'}</TableCell>
                <TableCell>{q.asker}</TableCell>
                <TableCell>{q.owner}</TableCell>
                <TableCell className="max-w-[300px] truncate">{q.question}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openDetail(q); }}>
                    <MessageSquareText className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea placeholder="Question text..." value={fQuestion} onChange={(e) => setFQuestion(e.target.value)} rows={3} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Asker name" value={fAsker} onChange={(e) => setFAsker(e.target.value)} />
              <Input placeholder="Owner name" value={fOwner} onChange={(e) => setFOwner(e.target.value)} />
            </div>
            <Select value={fPackageId} onValueChange={setFPackageId}>
              <SelectTrigger><SelectValue placeholder="Package (optional)" /></SelectTrigger>
              <SelectContent>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Vendor name (optional)" value={fVendor} onChange={(e) => setFVendor(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!fQuestion.trim() || !fAsker.trim() || !fOwner.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) { setDetailOpen(false); setSelected(null); setDResponse(''); setDAnsweredBy(''); setDNotes(''); } else setDetailOpen(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Question #{selected?.index} &mdash;{' '}
              <Badge variant="secondary" className={QUESTION_STATUS_COLORS[selected?.status || 'open']}>
                {selected?.status}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Asker:</span> {selected.asker}</div>
                <div><span className="text-muted-foreground">Owner:</span> {selected.owner}</div>
                <div><span className="text-muted-foreground">Package:</span> {selected.packageName || '-'}</div>
                <div><span className="text-muted-foreground">Vendor:</span> {selected.vendorName || '-'}</div>
                <div><span className="text-muted-foreground">Opened:</span> {ensureDate(selected.dateOpened).toLocaleDateString()}</div>
                {selected.dateClosed && (
                  <div><span className="text-muted-foreground">Closed:</span> {ensureDate(selected.dateClosed).toLocaleDateString()}</div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Question</label>
                <p className="mt-1 rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{selected.question}</p>
              </div>

              <div>
                <label className="text-sm font-medium">Response</label>
                <Textarea
                  value={dResponse}
                  onChange={(e) => setDResponse(e.target.value)}
                  rows={3}
                  disabled={!canEdit}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Answered By</label>
                  <Input value={dAnsweredBy} onChange={(e) => setDAnsweredBy(e.target.value)} disabled={!canEdit} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <Input value={dNotes} onChange={(e) => setDNotes(e.target.value)} disabled={!canEdit} className="mt-1" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {canEdit && selected?.status === 'open' && (
              <Button variant="outline" onClick={handleClose}>Close Question</Button>
            )}
            {canEdit && (
              <Button onClick={handleSaveResponse}>Save Response</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
