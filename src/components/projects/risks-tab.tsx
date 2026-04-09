import { useState, useEffect } from 'react';
import type { Risk, RiskStatus, RiskRating } from '@/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { RISK_RATING_COLORS, RISK_STATUS_COLORS } from '@/lib/colors';
import { ensureDate } from '@/lib/utils';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

interface RisksTabProps {
  projectId: string;
  clientId: string;
  canEdit: boolean;
}

type ActionStatus = 'pending' | 'in-progress' | 'complete';

function computeRating(score: number): RiskRating {
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 15) return 'high';
  return 'critical';
}

function fmtCurrency(val?: number): string {
  if (val == null) return '—';
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: any): string {
  if (!d) return '—';
  return ensureDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  pending: 'Pending',
  'in-progress': 'In Progress',
  complete: 'Complete',
};

export function RisksTab({ projectId, clientId, canEdit }: RisksTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRisk, setDetailRisk] = useState<Risk | null>(null);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newImpact, setNewImpact] = useState('3');
  const [newLikelihood, setNewLikelihood] = useState('3');
  const [newFinancial, setNewFinancial] = useState('');
  const [newTimeImpact, setNewTimeImpact] = useState('');
  const [newAction, setNewAction] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');

  // Edit form
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editImpact, setEditImpact] = useState('3');
  const [editLikelihood, setEditLikelihood] = useState('3');
  const [editStatus, setEditStatus] = useState<RiskStatus>('open');
  const [editFinancial, setEditFinancial] = useState('');
  const [editTimeImpact, setEditTimeImpact] = useState('');
  const [editAction, setEditAction] = useState('');
  const [editActionStatus, setEditActionStatus] = useState<ActionStatus>('pending');
  const [editTargetDate, setEditTargetDate] = useState('');

  // Subscribe
  useEffect(() => {
    const colRef = collection(db, 'projects', projectId, 'risks');
    const unsub = onSnapshot(colRef, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Risk));
      items.sort((a, b) => (a.riskNumber || '').localeCompare(b.riskNumber || ''));
      setRisks(items);
    }, (err) => { console.error('[RisksTab] listener error:', err); });
    return unsub;
  }, [projectId]);

  // Keep detail in sync
  useEffect(() => {
    if (detailRisk) {
      const live = risks.find((r) => r.id === detailRisk.id);
      if (live) setDetailRisk(live);
    }
  }, [risks]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetCreateForm() {
    setNewTitle(''); setNewDesc(''); setNewOwner('');
    setNewImpact('3'); setNewLikelihood('3'); setNewFinancial('');
    setNewTimeImpact(''); setNewAction(''); setNewTargetDate('');
  }

  function openDetail(risk: Risk) {
    setDetailRisk(risk);
    setEditTitle(risk.title);
    setEditDesc(risk.description || '');
    setEditOwner(risk.riskOwner || '');
    setEditImpact(String(risk.impact));
    setEditLikelihood(String(risk.likelihood));
    setEditStatus(risk.status);
    setEditFinancial(risk.estimatedFinancialValue != null ? String(risk.estimatedFinancialValue) : '');
    setEditTimeImpact(risk.estimatedTimeImpact || '');
    setEditAction(risk.actionDescription || '');
    setEditActionStatus(risk.actionStatus || 'pending');
    setEditTargetDate(risk.targetCompletionDate || '');
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newOwner.trim()) return;
    const impact = parseInt(newImpact);
    const likelihood = parseInt(newLikelihood);
    const score = impact * likelihood;
    const rating = computeRating(score);
    const maxNum = risks.length > 0 ? Math.max(...risks.map(r => {
      const parts = (r.riskNumber || '').split('-');
      return parseInt(parts[1] || '0', 10) || 0;
    })) : 0;
    const riskNumber = `R-${String(maxNum + 1).padStart(3, '0')}`;
    const estFin = newFinancial ? parseFloat(newFinancial) : undefined;
    const weightedFin = estFin != null ? estFin * (score / 25) : undefined;

    try {
      const data: Record<string, any> = {
        riskNumber, title: newTitle.trim(), description: newDesc.trim(),
        status: 'open' as RiskStatus, riskOwner: newOwner.trim(),
        impact, likelihood, score, rating,
        actionStatus: 'pending',
        createdBy: user?.uid || 'unknown',
        createdAt: serverTimestamp(), lastUpdated: serverTimestamp(),
      };
      if (estFin != null) { data.estimatedFinancialValue = estFin; data.weightedFinancialValue = weightedFin; }
      if (newTimeImpact.trim()) data.estimatedTimeImpact = newTimeImpact.trim();
      if (newAction.trim()) data.actionDescription = newAction.trim();
      if (newTargetDate) data.targetCompletionDate = newTargetDate;

      const docRef = await addDoc(collection(db, 'projects', projectId, 'risks'), data);
      await logAudit({
        action: 'risk.created', category: 'client',
        targetCollection: `projects/${projectId}/risks`, targetDocId: docRef.id, clientId,
        details: { riskNumber, title: newTitle.trim(), score, rating },
      });
      toast({ title: 'Risk created', description: riskNumber });
      setCreateOpen(false);
      resetCreateForm();
    } catch {
      toast({ title: 'Error', description: 'Operation failed. Please try again.', variant: 'destructive' });
    }
  }

  async function handleUpdate() {
    if (!detailRisk || !editTitle.trim()) return;
    const impact = parseInt(editImpact);
    const likelihood = parseInt(editLikelihood);
    const score = impact * likelihood;
    const rating = computeRating(score);
    const estFin = editFinancial ? parseFloat(editFinancial) : undefined;
    const weightedFin = estFin != null ? estFin * (score / 25) : undefined;
    const statusChanged = editStatus !== detailRisk.status;

    const updates: Record<string, any> = {
      title: editTitle.trim(), description: editDesc.trim(),
      riskOwner: editOwner.trim(), status: editStatus,
      impact, likelihood, score, rating,
      actionStatus: editActionStatus,
      lastUpdated: serverTimestamp(),
    };
    if (estFin != null) { updates.estimatedFinancialValue = estFin; updates.weightedFinancialValue = weightedFin; }
    if (editTimeImpact.trim()) updates.estimatedTimeImpact = editTimeImpact.trim();
    if (editAction.trim()) updates.actionDescription = editAction.trim();
    if (editTargetDate) updates.targetCompletionDate = editTargetDate;

    try {
      const ref = doc(db, 'projects', projectId, 'risks', detailRisk.id);
      await updateDoc(ref, updates);
      await logAudit({
        action: statusChanged ? 'risk.status_changed' : 'risk.updated',
        category: 'client',
        targetCollection: `projects/${projectId}/risks`, targetDocId: detailRisk.id, clientId,
        details: {
          riskNumber: detailRisk.riskNumber, score, rating,
          ...(statusChanged ? { oldStatus: detailRisk.status, newStatus: editStatus } : {}),
        },
      });
      toast({ title: 'Risk updated' });
      setDetailRisk(null);
    } catch {
      toast({ title: 'Error', description: 'Operation failed. Please try again.', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Risk Register</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Risk
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No risks registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Risk#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-center">Impact</TableHead>
                  <TableHead className="text-center">Likelihood</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="text-right">Est. Financial</TableHead>
                  <TableHead>Action Status</TableHead>
                  <TableHead>Target Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                    <TableCell className="font-mono text-sm">{r.riskNumber}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={RISK_STATUS_COLORS[r.status]}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.title}</TableCell>
                    <TableCell>{r.riskOwner}</TableCell>
                    <TableCell className="text-center">{r.impact}</TableCell>
                    <TableCell className="text-center">{r.likelihood}</TableCell>
                    <TableCell className="text-center font-medium">{r.score}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={RISK_RATING_COLORS[r.rating]}>{r.rating}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtCurrency(r.estimatedFinancialValue)}</TableCell>
                    <TableCell>{ACTION_STATUS_LABELS[r.actionStatus || 'pending']}</TableCell>
                    <TableCell className="text-sm">{fmtDate(r.targetCompletionDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create Risk Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Risk</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Risk title" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Owner</label>
              <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Risk owner name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Impact (1-5)</label>
                <Select value={newImpact} onValueChange={setNewImpact}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Negligible</SelectItem>
                    <SelectItem value="2">2 — Minor</SelectItem>
                    <SelectItem value="3">3 — Moderate</SelectItem>
                    <SelectItem value="4">4 — Major</SelectItem>
                    <SelectItem value="5">5 — Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Likelihood (1-5)</label>
                <Select value={newLikelihood} onValueChange={setNewLikelihood}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Negligible</SelectItem>
                    <SelectItem value="2">2 — Minor</SelectItem>
                    <SelectItem value="3">3 — Moderate</SelectItem>
                    <SelectItem value="4">4 — Major</SelectItem>
                    <SelectItem value="5">5 — Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Estimated Financial Value ($)</label>
              <Input type="number" value={newFinancial} onChange={(e) => setNewFinancial(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Estimated Time Impact</label>
              <Input value={newTimeImpact} onChange={(e) => setNewTimeImpact(e.target.value)} placeholder="e.g. 2 weeks" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Action Description</label>
              <Textarea value={newAction} onChange={(e) => setNewAction(e.target.value)} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Target Completion Date</label>
              <Input type="date" value={newTargetDate} onChange={(e) => setNewTargetDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || !newOwner.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Edit Dialog */}
      <Dialog open={!!detailRisk} onOpenChange={(open) => { if (!open) setDetailRisk(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailRisk && (
            <>
              <DialogHeader>
                <DialogTitle>{detailRisk.riskNumber} — Edit Risk</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={!canEdit} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Description</label>
                  <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} disabled={!canEdit} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Status</label>
                    <Select value={editStatus} onValueChange={(v) => setEditStatus(v as RiskStatus)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="mitigated">Mitigated</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Owner</label>
                    <Input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} disabled={!canEdit} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Impact (1-5)</label>
                    <Select value={editImpact} onValueChange={setEditImpact} disabled={!canEdit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Negligible</SelectItem>
                        <SelectItem value="2">2 — Minor</SelectItem>
                        <SelectItem value="3">3 — Moderate</SelectItem>
                        <SelectItem value="4">4 — Major</SelectItem>
                        <SelectItem value="5">5 — Severe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Likelihood (1-5)</label>
                    <Select value={editLikelihood} onValueChange={setEditLikelihood} disabled={!canEdit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Negligible</SelectItem>
                        <SelectItem value="2">2 — Minor</SelectItem>
                        <SelectItem value="3">3 — Moderate</SelectItem>
                        <SelectItem value="4">4 — Major</SelectItem>
                        <SelectItem value="5">5 — Severe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Score: <strong>{parseInt(editImpact) * parseInt(editLikelihood)}</strong> — Rating:{' '}
                  <Badge variant="secondary" className={RISK_RATING_COLORS[computeRating(parseInt(editImpact) * parseInt(editLikelihood))]}>
                    {computeRating(parseInt(editImpact) * parseInt(editLikelihood))}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Estimated Financial Value ($)</label>
                  <Input type="number" value={editFinancial} onChange={(e) => setEditFinancial(e.target.value)} disabled={!canEdit} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Estimated Time Impact</label>
                  <Input value={editTimeImpact} onChange={(e) => setEditTimeImpact(e.target.value)} disabled={!canEdit} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Action Description</label>
                  <Textarea value={editAction} onChange={(e) => setEditAction(e.target.value)} rows={2} disabled={!canEdit} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Action Status</label>
                    <Select value={editActionStatus} onValueChange={(v) => setEditActionStatus(v as ActionStatus)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Target Date</label>
                    <Input type="date" value={editTargetDate} onChange={(e) => setEditTargetDate(e.target.value)} disabled={!canEdit} />
                  </div>
                </div>
              </div>
              {canEdit && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetailRisk(null)}>Cancel</Button>
                  <Button onClick={handleUpdate} disabled={!editTitle.trim()}>Save Changes</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
