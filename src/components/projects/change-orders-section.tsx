import { useState, useEffect } from 'react';
import type { ChangeOrder, ChangeOrderComment, ChangeOrderStatus, ChangeOrderType, EquipmentPackage } from '@/types';
import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, updateDoc, onSnapshot, query, where, getDocs, serverTimestamp, arrayUnion,
} from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { CO_STATUS_COLORS, FINANCIAL_COLORS } from '@/lib/colors';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, MessageSquare, Check, X, Send, FileText } from 'lucide-react';

interface ChangeOrdersSectionProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
}

const TYPE_COLORS: Record<ChangeOrderType, string> = {
  addition: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  deletion: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
  'scope-change': 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  other: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

const TYPE_LABELS: Record<ChangeOrderType, string> = {
  addition: 'Addition',
  deletion: 'Deletion',
  'scope-change': 'Scope Change',
  other: 'Other',
};

function fmt(val: number): string {
  const abs = Math.abs(val);
  const str = `$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return val >= 0 ? `+${str}` : `-${str}`;
}

function fmtDate(d: any): string {
  if (!d) return '—';
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ChangeOrdersSection({ projectId, clientId, packages, canEdit }: ChangeOrdersSectionProps) {
  const { toast } = useToast();
  const { user, profile, isAdmin } = useAuth();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailCO, setDetailCO] = useState<ChangeOrder | null>(null);

  // Create form state
  const [newPackageId, setNewPackageId] = useState('');
  const [newType, setNewType] = useState<ChangeOrderType>('addition');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newValue, setNewValue] = useState('');

  // Detail dialog state
  const [rejectionReason, setRejectionReason] = useState('');
  const [commentText, setCommentText] = useState('');

  // Subscribe to change orders
  useEffect(() => {
    const colRef = collection(db, 'projects', projectId, 'changeOrders');
    const unsub = onSnapshot(colRef, (snap) => {
      const cos = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChangeOrder));
      cos.sort((a, b) => (a.coNumber || '').localeCompare(b.coNumber || ''));
      setChangeOrders(cos);
    }, (err) => { console.error('[ChangeOrdersSection] listener error:', err); });
    return unsub;
  }, [projectId]);

  // Keep detail dialog in sync with live data
  useEffect(() => {
    if (detailCO) {
      const live = changeOrders.find((c) => c.id === detailCO.id);
      if (live) setDetailCO(live);
    }
  }, [changeOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetCreateForm = () => {
    setNewPackageId('');
    setNewType('addition');
    setNewTitle('');
    setNewDesc('');
    setNewValue('');
  };

  async function recalcPackageTotal(packageId: string) {
    const colRef = collection(db, 'projects', projectId, 'changeOrders');
    const snap = await getDocs(query(colRef, where('packageId', '==', packageId), where('status', '==', 'approved')));
    const total = snap.docs.reduce((sum, d) => sum + (d.data().value || 0), 0);
    await updateDoc(doc(db, 'projects', projectId, 'packages', packageId), {
      changeOrderTotal: total,
      updatedAt: serverTimestamp(),
    });
    logAudit({
      action: 'package.co_total_recalculated',
      category: 'client',
      targetCollection: `projects/${projectId}/packages`,
      targetDocId: packageId,
      clientId,
      details: { newTotal: total },
    });
  }

  async function handleCreate() {
    if (!newPackageId || !newTitle.trim()) return;
    const pkg = packages.find((p) => p.id === newPackageId);
    if (!pkg) return;
    const coNumber = `CO-${String(changeOrders.length + 1).padStart(3, '0')}`;
    try {
      const docRef = await addDoc(collection(db, 'projects', projectId, 'changeOrders'), {
        coNumber,
        projectId,
        packageId: newPackageId,
        packageName: pkg.name,
        changeType: newType,
        title: newTitle.trim(),
        description: newDesc.trim(),
        value: parseFloat(newValue) || 0,
        status: 'draft' as ChangeOrderStatus,
        comments: [],
        createdBy: user?.uid || 'unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAudit({
        action: 'changeorder.created', category: 'client',
        targetCollection: `projects/${projectId}/changeOrders`, targetDocId: docRef.id, clientId,
        details: { coNumber, packageId: newPackageId, changeType: newType, title: newTitle.trim(), value: parseFloat(newValue) || 0 },
      });
      toast({ title: 'Change order created', description: coNumber });
      setCreateOpen(false);
      resetCreateForm();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }

  async function handleStatusChange(co: ChangeOrder, newStatus: ChangeOrderStatus) {
    const ref = doc(db, 'projects', projectId, 'changeOrders', co.id);
    const updates: Record<string, any> = { status: newStatus, updatedAt: serverTimestamp() };
    if (newStatus === 'submitted') {
      updates.submittedBy = user?.uid;
      updates.submittedAt = serverTimestamp();
    } else if (newStatus === 'approved') {
      updates.approvedBy = user?.uid;
      updates.approvedAt = serverTimestamp();
    } else if (newStatus === 'rejected') {
      if (!rejectionReason.trim()) {
        toast({ title: 'Rejection reason required', variant: 'destructive' });
        return;
      }
      updates.rejectedBy = user?.uid;
      updates.rejectedAt = serverTimestamp();
      updates.rejectionReason = rejectionReason.trim();
    }
    try {
      await updateDoc(ref, updates);
      await logAudit({
        action: `changeorder.${newStatus}`, category: 'client',
        targetCollection: `projects/${projectId}/changeOrders`, targetDocId: co.id, clientId,
        details: { coNumber: co.coNumber, newStatus, ...(newStatus === 'rejected' ? { reason: rejectionReason.trim() } : {}) },
      });
      if (newStatus === 'approved' || newStatus === 'rejected') {
        await recalcPackageTotal(co.packageId);
      }
      toast({ title: `CO ${newStatus}` });
      setRejectionReason('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }

  async function handleAddComment() {
    if (!detailCO || !commentText.trim()) return;
    const comment: ChangeOrderComment = {
      id: crypto.randomUUID(),
      authorId: user?.uid || 'unknown',
      authorName: profile?.name || user?.email?.split('@')[0] || 'Unknown',
      text: commentText.trim(),
      createdAt: new Date(),
    };
    const ref = doc(db, 'projects', projectId, 'changeOrders', detailCO.id);
    try {
      await updateDoc(ref, {
        comments: arrayUnion(comment),
        updatedAt: serverTimestamp(),
      });
      await logAudit({
        action: 'changeorder.comment_added', category: 'client',
        targetCollection: `projects/${projectId}/changeOrders`, targetDocId: detailCO.id, clientId,
        details: { coNumber: detailCO.coNumber, commentId: comment.id },
      });
      setCommentText('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Change Orders</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Change Order
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {changeOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No change orders yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CO#</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changeOrders.map((co) => (
                <TableRow key={co.id}>
                  <TableCell className="font-mono text-sm">{co.coNumber}</TableCell>
                  <TableCell>{co.packageName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={TYPE_COLORS[co.changeType]}>{TYPE_LABELS[co.changeType]}</Badge>
                  </TableCell>
                  <TableCell>{co.title}</TableCell>
                  <TableCell className={`text-right font-medium ${co.value >= 0 ? FINANCIAL_COLORS.overBudget : FINANCIAL_COLORS.underBudget}`}>
                    {fmt(co.value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={CO_STATUS_COLORS[co.status]}>{co.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(co.createdAt)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => { setDetailCO(co); setRejectionReason(''); setCommentText(''); }}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create CO Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Change Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Package</label>
              <Select value={newPackageId} onValueChange={setNewPackageId}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Change Type</label>
              <Select value={newType} onValueChange={(v) => setNewType(v as ChangeOrderType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="addition">Addition</SelectItem>
                  <SelectItem value="deletion">Deletion</SelectItem>
                  <SelectItem value="scope-change">Scope Change</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Brief description of change" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Detailed description..." rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Value ($)</label>
              <Input type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Positive = cost increase, negative = credit" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newPackageId || !newTitle.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CO Detail Dialog */}
      <Dialog open={!!detailCO} onOpenChange={(open) => { if (!open) { setDetailCO(null); setRejectionReason(''); setCommentText(''); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailCO && (
            <>
              <DialogHeader>
                <DialogTitle>{detailCO.coNumber} — {detailCO.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Package:</span> {detailCO.packageName}</div>
                  <div><span className="text-muted-foreground">Type:</span>{' '}
                    <Badge variant="secondary" className={TYPE_COLORS[detailCO.changeType]}>{TYPE_LABELS[detailCO.changeType]}</Badge>
                  </div>
                  <div><span className="text-muted-foreground">Value:</span>{' '}
                    <span className={`font-medium ${detailCO.value >= 0 ? FINANCIAL_COLORS.overBudget : FINANCIAL_COLORS.underBudget}`}>
                      {fmt(detailCO.value)}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground">Status:</span>{' '}
                    <Badge variant="secondary" className={CO_STATUS_COLORS[detailCO.status]}>{detailCO.status}</Badge>
                  </div>
                  <div className="col-span-2"><span className="text-muted-foreground">Created:</span> {fmtDate(detailCO.createdAt)}</div>
                  {detailCO.submittedAt && (
                    <div className="col-span-2"><span className="text-muted-foreground">Submitted:</span> {fmtDate(detailCO.submittedAt)}</div>
                  )}
                  {detailCO.approvedAt && (
                    <div className="col-span-2"><span className="text-muted-foreground">Approved:</span> {fmtDate(detailCO.approvedAt)}</div>
                  )}
                  {detailCO.rejectedAt && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Rejected:</span> {fmtDate(detailCO.rejectedAt)}
                      {detailCO.rejectionReason && <span className="ml-2 text-red-500">— {detailCO.rejectionReason}</span>}
                    </div>
                  )}
                </div>
                {detailCO.description && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Description</p>
                    <p className="text-sm whitespace-pre-wrap">{detailCO.description}</p>
                  </div>
                )}

                {/* Status workflow buttons */}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {detailCO.status === 'draft' && (
                      <Button size="sm" onClick={() => handleStatusChange(detailCO, 'submitted')}>
                        <Send className="h-4 w-4 mr-1" /> Submit for Approval
                      </Button>
                    )}
                    {detailCO.status === 'submitted' && isAdmin && (
                      <>
                        <Button size="sm" variant="default" onClick={() => handleStatusChange(detailCO, 'approved')}>
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <div className="flex items-center gap-2 w-full">
                          <Input
                            placeholder="Rejection reason..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="flex-1"
                          />
                          <Button size="sm" variant="destructive" disabled={!rejectionReason.trim()} onClick={() => handleStatusChange(detailCO, 'rejected')}>
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Comments section */}
                <div className="pt-2 border-t">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" /> Comments ({detailCO.comments?.length || 0})
                  </h4>
                  {(detailCO.comments || []).length > 0 && (
                    <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                      {detailCO.comments.map((c) => (
                        <div key={c.id} className="text-xs border-b pb-2">
                          <div className="flex justify-between text-muted-foreground mb-0.5">
                            <span className="font-medium">{c.authorName}</span>
                            <span>{fmtDate(c.createdAt)}</span>
                          </div>
                          <p>{c.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleAddComment} disabled={!commentText.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
