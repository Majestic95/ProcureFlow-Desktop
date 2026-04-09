import { useState } from 'react';
import type { EquipmentPackage, PaymentMilestone } from '@/types';
import { DEFAULT_PAYMENT_STAGES } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { PAYMENT_STATUS_COLORS, FINANCIAL_COLORS } from '@/lib/colors';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { ChangeOrdersSection } from './change-orders-section';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FinancialsTabProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(val: number | undefined): string {
  if (val === undefined || val === null) return '—';
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinancialsTab({ projectId, clientId, packages, canEdit }: FinancialsTabProps) {
  return (
    <div className="space-y-6">
      <SavingsSection projectId={projectId} clientId={clientId} packages={packages} canEdit={canEdit} />
      <PaymentMilestonesSection projectId={projectId} clientId={clientId} packages={packages} canEdit={canEdit} />
      <ChangeOrdersSection projectId={projectId} clientId={clientId} packages={packages} canEdit={canEdit} />
    </div>
  );
}

// ===========================================================================
// Section 1 — Savings Tracker (B3)
// ===========================================================================

function SavingsSection({ projectId, clientId, packages, canEdit }: FinancialsTabProps) {
  const { toast } = useToast();
  const [editPkg, setEditPkg] = useState<EquipmentPackage | null>(null);
  const [editInitialBid, setEditInitialBid] = useState('');
  const [editBafo, setEditBafo] = useState('');

  const openEdit = (pkg: EquipmentPackage) => {
    setEditPkg(pkg);
    setEditInitialBid(pkg.initialBidPrice?.toString() ?? '');
    setEditBafo(pkg.bafoPrice?.toString() ?? '');
  };

  const handleSave = async () => {
    if (!editPkg) return;
    const initialBid = editInitialBid ? parseFloat(editInitialBid) : undefined;
    const bafo = editBafo ? parseFloat(editBafo) : undefined;
    const updates: Record<string, any> = { updatedAt: serverTimestamp() };
    if (initialBid !== undefined && !isNaN(initialBid)) updates.initialBidPrice = initialBid;
    if (bafo !== undefined && !isNaN(bafo)) updates.bafoPrice = bafo;

    try {
      await updateDoc(doc(db, 'projects', projectId, 'packages', editPkg.id), updates);
      logAudit({
        action: 'package.savings_updated', category: 'schedule',
        targetCollection: `projects/${projectId}/packages`, targetDocId: editPkg.id,
        clientId, details: { packageName: editPkg.name, initialBidPrice: initialBid, bafoPrice: bafo },
      });
      toast({ title: 'Savings Updated', description: editPkg.name });
      setEditPkg(null);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update savings.' });
    }
  };

  // Totals
  const totalInitial = packages.reduce((s, p) => s + (p.initialBidPrice ?? 0), 0);
  const totalBafo = packages.reduce((s, p) => s + (p.bafoPrice ?? 0), 0);
  const totalSavings = totalInitial - totalBafo;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Savings Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Package</TableHead>
                  <TableHead className="min-w-[120px]">Supplier</TableHead>
                  <TableHead className="text-right w-28">Initial Bid</TableHead>
                  <TableHead className="text-right w-28">BAFO</TableHead>
                  <TableHead className="text-right w-28">Savings</TableHead>
                  <TableHead className="text-right w-20">Savings %</TableHead>
                  {canEdit && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map(pkg => {
                  const hasData = pkg.initialBidPrice !== undefined && pkg.bafoPrice !== undefined;
                  const savings = hasData ? (pkg.initialBidPrice! - pkg.bafoPrice!) : undefined;
                  const savingsPct = hasData && pkg.initialBidPrice! > 0
                    ? ((savings! / pkg.initialBidPrice!) * 100) : undefined;
                  return (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium text-sm">{pkg.name}</TableCell>
                      <TableCell className="text-xs">{pkg.awardedSupplierName ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(pkg.initialBidPrice)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(pkg.bafoPrice)}</TableCell>
                      <TableCell className={`text-right text-xs tabular-nums ${savings !== undefined ? (savings > 0 ? FINANCIAL_COLORS.underBudget : savings < 0 ? FINANCIAL_COLORS.overBudget : '') : ''}`}>
                        {savings !== undefined ? formatCurrency(Math.abs(savings)) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {savingsPct !== undefined ? `${savingsPct.toFixed(1)}%` : '—'}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pkg)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {/* Summary row */}
                {packages.length > 0 && (
                  <TableRow className="font-semibold border-t-2">
                    <TableCell colSpan={2} className="text-sm">Total</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(totalInitial || undefined)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(totalBafo || undefined)}</TableCell>
                    <TableCell className={`text-right text-xs tabular-nums ${totalSavings > 0 ? FINANCIAL_COLORS.underBudget : totalSavings < 0 ? FINANCIAL_COLORS.overBudget : ''}`}>
                      {totalInitial > 0 ? formatCurrency(Math.abs(totalSavings)) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {totalInitial > 0 ? `${((totalSavings / totalInitial) * 100).toFixed(1)}%` : '—'}
                    </TableCell>
                    {canEdit && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Savings Dialog */}
      <Dialog open={!!editPkg} onOpenChange={(open) => { if (!open) { setEditPkg(null); setEditInitialBid(''); setEditBafo(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Savings: {editPkg?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium">Initial Bid ($)</label>
              <p className="text-[10px] text-muted-foreground">First proposal price received</p>
              <Input type="number" min={0} placeholder="0" value={editInitialBid} onChange={(e) => setEditInitialBid(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">BAFO ($)</label>
              <p className="text-[10px] text-muted-foreground">Best and Final Offer — negotiated price</p>
              <Input type="number" min={0} placeholder="0" value={editBafo} onChange={(e) => setEditBafo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===========================================================================
// Section 2 — Payment Milestones (B4)
// ===========================================================================

function PaymentMilestonesSection({ projectId, clientId, packages, canEdit }: FinancialsTabProps) {
  const { toast } = useToast();
  const awardedPackages = packages.filter(p => p.awardValue && p.awardValue > 0);

  const [editPkg, setEditPkg] = useState<EquipmentPackage | null>(null);
  const [editMilestones, setEditMilestones] = useState<PaymentMilestone[]>([]);

  const openEdit = (pkg: EquipmentPackage) => {
    setEditPkg(pkg);
    setEditMilestones(pkg.paymentMilestones ? [...pkg.paymentMilestones.map(m => ({ ...m }))] : []);
  };

  const initDefaults = async (pkg: EquipmentPackage) => {
    const milestones: PaymentMilestone[] = DEFAULT_PAYMENT_STAGES.map(name => ({
      id: makeId(), name, percentage: 0, status: 'pending' as const,
    }));
    try {
      await updateDoc(doc(db, 'projects', projectId, 'packages', pkg.id), {
        paymentMilestones: milestones, updatedAt: serverTimestamp(),
      });
      logAudit({
        action: 'package.payments_updated', category: 'schedule',
        targetCollection: `projects/${projectId}/packages`, targetDocId: pkg.id,
        clientId, details: { packageName: pkg.name, action: 'initialized_defaults' },
      });
      toast({ title: 'Default Stages Initialized', description: pkg.name });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to initialize stages.' });
    }
  };

  const addStage = () => {
    setEditMilestones(prev => [...prev, { id: makeId(), name: '', percentage: 0, status: 'pending' }]);
  };

  const removeStage = (id: string) => {
    setEditMilestones(prev => prev.filter(m => m.id !== id));
  };

  const updateStage = (id: string, field: keyof PaymentMilestone, value: any) => {
    setEditMilestones(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleSave = async () => {
    if (!editPkg) return;
    try {
      await updateDoc(doc(db, 'projects', projectId, 'packages', editPkg.id), {
        paymentMilestones: editMilestones, updatedAt: serverTimestamp(),
      });
      logAudit({
        action: 'package.payments_updated', category: 'schedule',
        targetCollection: `projects/${projectId}/packages`, targetDocId: editPkg.id,
        clientId, details: { packageName: editPkg.name, stageCount: editMilestones.length },
      });
      toast({ title: 'Payment Milestones Updated', description: editPkg.name });
      setEditPkg(null);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update milestones.' });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Payment Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          {awardedPackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No awarded packages with a contract value yet.</p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {awardedPackages.map(pkg => {
                const milestones = pkg.paymentMilestones ?? [];
                return (
                  <AccordionItem key={pkg.id} value={pkg.id}>
                    <AccordionTrigger className="text-sm">
                      <div className="flex items-center gap-3 text-left">
                        <span className="font-medium">{pkg.name}</span>
                        {pkg.awardedSupplierName && (
                          <span className="text-xs text-muted-foreground">— {pkg.awardedSupplierName}</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto mr-4">
                          {formatCurrency(pkg.awardValue)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {milestones.length === 0 ? (
                        <div className="flex items-center gap-3 py-2">
                          <p className="text-sm text-muted-foreground">No payment stages defined.</p>
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => initDefaults(pkg)} title="Adds standard payment stages: Order Deposit, Design Approval, Production Start, etc.">
                              Initialize Default Stages
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="min-w-[140px]">Stage</TableHead>
                                  <TableHead className="text-right w-16">%</TableHead>
                                  <TableHead className="text-right w-28">Amount ($)</TableHead>
                                  <TableHead className="w-28">Target Date</TableHead>
                                  <TableHead className="w-28">Actual Date</TableHead>
                                  <TableHead className="w-24">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {milestones.map(m => {
                                  const amount = (m.percentage / 100) * (pkg.awardValue ?? 0);
                                  return (
                                    <TableRow key={m.id}>
                                      <TableCell className="text-sm">{m.name}</TableCell>
                                      <TableCell className="text-right text-xs tabular-nums">{m.percentage}%</TableCell>
                                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(amount)}</TableCell>
                                      <TableCell className="text-xs">{m.targetDate ?? '—'}</TableCell>
                                      <TableCell className="text-xs">{m.actualDate ?? '—'}</TableCell>
                                      <TableCell>
                                        <Badge variant="secondary" className={`${PAYMENT_STATUS_COLORS[m.status]} text-xs`}>
                                          {m.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          {canEdit && (
                            <div className="flex justify-end pt-1">
                              <Button size="sm" variant="outline" onClick={() => openEdit(pkg)}>
                                <Pencil className="mr-1 h-3 w-3" /> Edit Milestones
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Edit Milestones Dialog */}
      <Dialog open={!!editPkg} onOpenChange={(open) => { if (!open) setEditPkg(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Payment Milestones: {editPkg?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editMilestones.map((m, i) => (
              <div key={m.id} className="grid grid-cols-[1fr_60px_100px_100px_100px_32px] gap-2 items-end">
                <div>
                  {i === 0 && <label className="text-xs font-medium">Stage</label>}
                  <Input value={m.name} placeholder="Stage name" onChange={(e) => updateStage(m.id, 'name', e.target.value)} />
                </div>
                <div>
                  {i === 0 && <label className="text-xs font-medium">%</label>}
                  <Input type="number" min={0} max={100} value={m.percentage} onChange={(e) => updateStage(m.id, 'percentage', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  {i === 0 && <label className="text-xs font-medium">Target Date</label>}
                  <Input type="date" value={m.targetDate ?? ''} onChange={(e) => updateStage(m.id, 'targetDate', e.target.value || undefined)} />
                </div>
                <div>
                  {i === 0 && <label className="text-xs font-medium">Actual Date</label>}
                  <Input type="date" value={m.actualDate ?? ''} onChange={(e) => updateStage(m.id, 'actualDate', e.target.value || undefined)} />
                </div>
                <div>
                  {i === 0 && <label className="text-xs font-medium">Status</label>}
                  <Select value={m.status} onValueChange={(v) => updateStage(m.id, 'status', v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="invoiced">Invoiced</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeStage(m.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addStage}>
              <Plus className="mr-1 h-3 w-3" /> Add Stage
            </Button>
            {(() => {
              const totalPct = editMilestones.reduce((sum, m) => sum + (m.percentage || 0), 0);
              return (
                <div className={`text-xs mt-2 ${Math.abs(totalPct - 100) < 0.01 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  Total: {totalPct.toFixed(1)}%{Math.abs(totalPct - 100) >= 0.01 && ' — should equal 100%'}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={(() => { const totalPct = editMilestones.reduce((sum, m) => sum + (m.percentage || 0), 0); return Math.abs(totalPct - 100) >= 0.1 || editMilestones.some(m => m.percentage < 0); })()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
