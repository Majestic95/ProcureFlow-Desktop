import { useState, useEffect, useMemo } from 'react';
import type { DeliveryBatch, EquipmentPackage } from '@/types';
import { INCOTERMS, DELIVERY_STATUS_OPTIONS } from '@/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { DELIVERY_STATUS_COLORS } from '@/lib/colors';
import { ensureDate } from '@/lib/utils';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Plus, Package, Truck } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: any): string {
  if (!d) return '—';
  return ensureDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface DeliveriesTabProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
}

type FormState = {
  packageId: string;
  description: string;
  quantity: string;
  incoterms: string;
  status: DeliveryBatch['status'];
  rojDate: string;
  targetDate: string;
  contractedDate: string;
  vendorPlannedDate: string;
  actualDate: string;
  actualQty: string;
  departurePoint: string;
  arrivalPoint: string;
  comments: string;
};

const emptyForm = (pkgId = ''): FormState => ({
  packageId: pkgId, description: '', quantity: '', incoterms: '', status: 'pending',
  rojDate: '', targetDate: '', contractedDate: '', vendorPlannedDate: '',
  actualDate: '', actualQty: '', departurePoint: '', arrivalPoint: '', comments: '',
});

export function DeliveriesTab({ projectId, clientId, packages, canEdit }: DeliveriesTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [batches, setBatches] = useState<DeliveryBatch[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<DeliveryBatch | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Real-time listener
  useEffect(() => {
    const colRef = collection(db, 'projects', projectId, 'deliveries');
    const unsub = onSnapshot(colRef, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryBatch));
      items.sort((a, b) => a.batchNumber - b.batchNumber);
      setBatches(items);
    }, (err) => { console.error('[DeliveriesTab] listener error:', err); });
    return unsub;
  }, [projectId]);

  // Group by package
  const grouped = useMemo(() => {
    const map = new Map<string, DeliveryBatch[]>();
    for (const pkg of packages) map.set(pkg.id, []);
    for (const b of batches) {
      const arr = map.get(b.packageId) || [];
      arr.push(b);
      map.set(b.packageId, arr);
    }
    return map;
  }, [batches, packages]);

  // Summary
  const summary = useMemo(() => {
    const total = batches.length;
    const delivered = batches.filter((b) => b.status === 'delivered').length;
    const delayed = batches.filter((b) => b.status === 'delayed').length;
    const pending = batches.filter((b) => b.status === 'pending').length;
    return { total, delivered, delayed, pending };
  }, [batches]);

  function pkgName(pkgId: string) {
    return packages.find((p) => p.id === pkgId)?.name || 'Unknown';
  }

  function nextBatchNumber(pkgId: string): number {
    const pkgBatches = batches.filter((b) => b.packageId === pkgId);
    if (pkgBatches.length === 0) return 1;
    return Math.max(...pkgBatches.map((b) => b.batchNumber)) + 1;
  }

  function openCreate(pkgId: string) {
    setForm(emptyForm(pkgId));
    setCreateOpen(true);
  }

  function openEdit(batch: DeliveryBatch) {
    setEditBatch(batch);
    setForm({
      packageId: batch.packageId,
      description: batch.description || '',
      quantity: String(batch.quantity),
      incoterms: batch.incoterms || '',
      status: batch.status,
      rojDate: batch.rojDate || '',
      targetDate: batch.targetDate || '',
      contractedDate: batch.contractedDate || '',
      vendorPlannedDate: batch.vendorPlannedDate || '',
      actualDate: batch.actualDate || '',
      actualQty: batch.actualQty != null ? String(batch.actualQty) : '',
      departurePoint: batch.departurePoint || '',
      arrivalPoint: batch.arrivalPoint || '',
      comments: batch.comments || '',
    });
  }

  const setField = (key: keyof FormState, val: string) => setForm((f) => ({ ...f, [key]: val }));

  async function handleCreate() {
    if (!form.quantity.trim() || !form.packageId) return;
    const batchNumber = nextBatchNumber(form.packageId);
    try {
      const data: Record<string, any> = {
        packageId: form.packageId,
        packageName: pkgName(form.packageId),
        batchNumber,
        quantity: parseInt(form.quantity, 10),
        status: form.status,
        createdBy: user?.uid || 'unknown',
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };
      if (form.description.trim()) data.description = form.description.trim();
      if (form.incoterms) data.incoterms = form.incoterms;
      if (form.rojDate) data.rojDate = form.rojDate;
      if (form.targetDate) data.targetDate = form.targetDate;
      if (form.contractedDate) data.contractedDate = form.contractedDate;
      if (form.vendorPlannedDate) data.vendorPlannedDate = form.vendorPlannedDate;
      if (form.departurePoint.trim()) data.departurePoint = form.departurePoint.trim();
      if (form.arrivalPoint.trim()) data.arrivalPoint = form.arrivalPoint.trim();

      const ref = await addDoc(collection(db, 'projects', projectId, 'deliveries'), data);
      logAudit({ action: 'delivery.created', category: 'client', targetCollection: 'deliveries', targetDocId: ref.id, clientId, details: { packageId: form.packageId, batchNumber } });
      toast({ title: 'Delivery batch created' });
      setCreateOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  async function handleUpdate() {
    if (!editBatch || !form.quantity.trim()) return;
    const oldStatus = editBatch.status;
    const newStatus = form.status;
    try {
      const data: Record<string, any> = {
        description: form.description.trim() || null,
        quantity: parseInt(form.quantity, 10),
        incoterms: form.incoterms || null,
        status: newStatus,
        rojDate: form.rojDate || null,
        targetDate: form.targetDate || null,
        contractedDate: form.contractedDate || null,
        vendorPlannedDate: form.vendorPlannedDate || null,
        actualDate: form.actualDate || null,
        actualQty: form.actualQty ? parseInt(form.actualQty, 10) : null,
        departurePoint: form.departurePoint.trim() || null,
        arrivalPoint: form.arrivalPoint.trim() || null,
        comments: form.comments.trim() || null,
        lastUpdated: serverTimestamp(),
      };
      await updateDoc(doc(db, 'projects', projectId, 'deliveries', editBatch.id), data);
      logAudit({ action: 'delivery.updated', category: 'client', targetCollection: 'deliveries', targetDocId: editBatch.id, clientId, details: { batchNumber: editBatch.batchNumber } });
      if (oldStatus !== newStatus) {
        logAudit({ action: 'delivery.status_changed', category: 'client', targetCollection: 'deliveries', targetDocId: editBatch.id, clientId, details: { from: oldStatus, to: newStatus } });
      }
      toast({ title: 'Delivery batch updated' });
      setEditBatch(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  // ---------------------------------------------------------------------------
  // Shared dialog body
  // ---------------------------------------------------------------------------
  function renderFormFields(isEdit: boolean) {
    return (
      <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
        {/* Package (read-only) */}
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Package</span>
          <span className="col-span-3 text-sm">{pkgName(form.packageId)}</span>
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Description</span>
          <Input className="col-span-3" value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="e.g., Shipment 1 of 3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Quantity *</span>
          <Input className="col-span-3" type="number" min={1} value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} />
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Incoterms</span>
          <Select value={form.incoterms} onValueChange={(v) => setField('incoterms', v)}>
            <SelectTrigger className="col-span-3"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{INCOTERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Status</span>
          <Select value={form.status} onValueChange={(v) => setField('status', v)}>
            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
            <SelectContent>{DELIVERY_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {/* Dates */}
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">ROJ Date</span>
          <Input className="col-span-3" type="date" value={form.rojDate} onChange={(e) => setField('rojDate', e.target.value)} />
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Target Date</span>
          <Input className="col-span-3" type="date" value={form.targetDate} onChange={(e) => setField('targetDate', e.target.value)} />
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Contracted Date</span>
          <Input className="col-span-3" type="date" value={form.contractedDate} onChange={(e) => setField('contractedDate', e.target.value)} />
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Vendor Planned</span>
          <Input className="col-span-3" type="date" value={form.vendorPlannedDate} onChange={(e) => setField('vendorPlannedDate', e.target.value)} />
        </div>
        {isEdit && (
          <>
            <div className="grid grid-cols-4 items-center gap-2">
              <span className="text-sm font-medium text-right">Actual Date</span>
              <Input className="col-span-3" type="date" value={form.actualDate} onChange={(e) => setField('actualDate', e.target.value)} />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <span className="text-sm font-medium text-right">Actual Qty</span>
              <Input className="col-span-3" type="number" min={0} value={form.actualQty} onChange={(e) => setField('actualQty', e.target.value)} />
            </div>
          </>
        )}
        {/* Points */}
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Departure</span>
          <Input className="col-span-3" value={form.departurePoint} onChange={(e) => setField('departurePoint', e.target.value)} />
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          <span className="text-sm font-medium text-right">Arrival</span>
          <Input className="col-span-3" value={form.arrivalPoint} onChange={(e) => setField('arrivalPoint', e.target.value)} />
        </div>
        {isEdit && (
          <div className="grid grid-cols-4 items-start gap-2">
            <span className="text-sm font-medium text-right pt-2">Comments</span>
            <Textarea className="col-span-3" rows={3} value={form.comments} onChange={(e) => setField('comments', e.target.value)} />
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Total Batches</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{summary.total}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Delivered</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-emerald-600">{summary.delivered}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Delayed</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{summary.delayed}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-gray-600">{summary.pending}</p></CardContent></Card>
      </div>

      {/* Accordion per package */}
      <Accordion type="multiple" className="w-full">
        {packages.map((pkg) => {
          const pkgBatches = grouped.get(pkg.id) || [];
          return (
            <AccordionItem key={pkg.id} value={pkg.id}>
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span className="font-semibold">{pkg.name}</span>
                  <Badge variant="secondary" className="ml-1">{pkgBatches.length} batch{pkgBatches.length !== 1 ? 'es' : ''}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {canEdit && (
                  <div className="mb-2">
                    <Button size="sm" variant="outline" onClick={() => openCreate(pkg.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Add Delivery
                    </Button>
                  </div>
                )}
                {pkgBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No delivery batches yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Batch</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-14">Qty</TableHead>
                          <TableHead className="w-16">Inco.</TableHead>
                          <TableHead className="w-24">Status</TableHead>
                          <TableHead>ROJ</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Contracted</TableHead>
                          <TableHead>Vendor Plan</TableHead>
                          <TableHead>Actual</TableHead>
                          <TableHead>Departure</TableHead>
                          <TableHead>Arrival</TableHead>
                          <TableHead>Comments</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pkgBatches.map((b) => (
                          <TableRow key={b.id} className={canEdit ? 'cursor-pointer hover:bg-muted/50' : ''} onClick={() => canEdit && openEdit(b)}>
                            <TableCell className="font-medium">#{b.batchNumber}</TableCell>
                            <TableCell className="max-w-[140px] truncate">{b.description || '—'}</TableCell>
                            <TableCell>{b.quantity}</TableCell>
                            <TableCell>{b.incoterms || '—'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={DELIVERY_STATUS_COLORS[b.status]}>{b.status}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(b.rojDate)}</TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(b.targetDate)}</TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(b.contractedDate)}</TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(b.vendorPlannedDate)}</TableCell>
                            <TableCell className="whitespace-nowrap">{fmtDate(b.actualDate)}</TableCell>
                            <TableCell className="max-w-[100px] truncate">{b.departurePoint || '—'}</TableCell>
                            <TableCell className="max-w-[100px] truncate">{b.arrivalPoint || '—'}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{b.comments || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setForm(emptyForm()); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Delivery Batch</DialogTitle></DialogHeader>
          {renderFormFields(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.quantity.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editBatch} onOpenChange={(open) => { if (!open) setEditBatch(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Delivery Batch #{editBatch?.batchNumber}</DialogTitle></DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBatch(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.quantity.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
