import { useState, useEffect } from 'react';
import type { EquipmentPackage, RagStatus, Supplier } from '@/types';
import { DISCIPLINES, MILESTONE_KEYS } from '@/types';
import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, deleteDoc, updateDoc, serverTimestamp, onSnapshot,
} from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';

import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { RAG_COLORS, FINANCIAL_COLORS } from '@/lib/colors';

interface PackagesTableProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  isAdmin: boolean;
  canEdit: boolean;
}

function formatCurrency(val: number | undefined): string {
  if (val === undefined || val === null) return '—';
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function emptyMilestones(): Record<string, { plannedDate: string; adjustedDate: string; actualDate: string }> {
  const m: Record<string, { plannedDate: string; adjustedDate: string; actualDate: string }> = {};
  for (const key of MILESTONE_KEYS) {
    m[key] = { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
  }
  return m;
}

export function PackagesTable({ projectId, clientId, packages, isAdmin, canEdit }: PackagesTableProps) {
  const { toast } = useToast();
  // Unified package dialog (create + edit)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPkg, setDialogPkg] = useState<EquipmentPackage | null>(null); // null = create mode
  const [fName, setFName] = useState('');
  const [fDiscipline, setFDiscipline] = useState('Mechanical');
  const [fQuantity, setFQuantity] = useState('');
  const [fBudget, setFBudget] = useState('');
  const [fAward, setFAward] = useState('');
  const [fSupplierId, setFSupplierId] = useState('');
  const [fComment, setFComment] = useState('');

  const isEditMode = !!dialogPkg;

  // Supplier list
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    });
    return () => unsub();
  }, []);

  const openCreateDialog = () => {
    setDialogPkg(null);
    setFName('');
    setFDiscipline('Mechanical');
    setFQuantity('');
    setFBudget('');
    setFAward('');
    setFSupplierId('');
    setFComment('');
    setDialogOpen(true);
  };

  const openEditDialog = (pkg: EquipmentPackage) => {
    setDialogPkg(pkg);
    setFName(pkg.name);
    setFDiscipline(pkg.discipline);
    setFQuantity(pkg.quantity?.toString() ?? '');
    setFBudget(pkg.budget?.toString() ?? '');
    setFAward(pkg.awardValue?.toString() ?? '');
    setFSupplierId(pkg.awardedSupplierId ?? '');
    setFComment(pkg.comment ?? '');
    setDialogOpen(true);
  };

  const resetDialog = () => {
    setDialogOpen(false);
    setDialogPkg(null);
    setFName(''); setFDiscipline('Mechanical'); setFQuantity(''); setFBudget(''); setFAward(''); setFSupplierId(''); setFComment('');
  };

  // Financial summary
  const totalBudget = packages.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  const totalAwarded = packages.reduce((sum, p) => sum + (p.awardValue ?? 0), 0);
  const totalCO = packages.reduce((sum, p) => sum + (p.changeOrderTotal ?? 0), 0);
  const totalDelta = totalBudget - (totalAwarded + totalCO);
  const boughtOutCount = packages.filter(p => p.awardValue && p.awardValue > 0).length;
  const boughtOutPct = packages.length > 0 ? Math.round((boughtOutCount / packages.length) * 100) : 0;

  // Total units across all packages
  const totalUnits = packages.reduce((sum, p) => sum + (p.quantity ?? 0), 0);

  const handleSavePackage = async () => {
    if (!fName.trim() || !fDiscipline) return;

    const quantity = fQuantity ? parseInt(fQuantity) : undefined;
    const budget = fBudget ? parseFloat(fBudget) : undefined;
    const award = fAward ? parseFloat(fAward) : undefined;

    // Resolve supplier
    let supplierId: string | undefined;
    let supplierName: string | undefined;
    if (fSupplierId && fSupplierId !== '__none') {
      const found = suppliers.find(s => s.id === fSupplierId);
      if (!found) {
        toast({ variant: 'destructive', title: 'Error', description: 'Supplier not found. Please try again.' });
        return;
      }
      supplierId = fSupplierId;
      supplierName = found.companyName;
    }

    try {
      if (isEditMode && dialogPkg) {
        // Update existing package
        const updates: Record<string, string | number | ReturnType<typeof serverTimestamp>> = {
          name: fName.trim(),
          discipline: fDiscipline,
          updatedAt: serverTimestamp(),
        };
        if (quantity !== undefined && !isNaN(quantity) && quantity >= 1) updates.quantity = quantity;
        if (budget !== undefined && !isNaN(budget) && budget >= 0) updates.budget = budget;
        if (award !== undefined && !isNaN(award) && award >= 0) updates.awardValue = award;
        if (supplierId) { updates.awardedSupplierId = supplierId; updates.awardedSupplierName = supplierName || ''; }
        else if (fSupplierId === '__none') { updates.awardedSupplierId = ''; updates.awardedSupplierName = ''; }
        if (fComment.trim() !== (dialogPkg.comment ?? '')) updates.comment = fComment.trim();

        await updateDoc(doc(db, 'projects', projectId, 'packages', dialogPkg.id), updates);
        logAudit({
          action: 'package.updated', category: 'schedule',
          targetCollection: `projects/${projectId}/packages`, targetDocId: dialogPkg.id,
          clientId, details: { packageName: fName.trim(), ...(budget !== undefined && { budget }), ...(award !== undefined && { awardValue: award }) },
        });
        toast({ title: 'Package Updated', description: fName.trim() });
      } else {
        // Create new package
        const nextItemNumber = packages.length > 0
          ? Math.max(...packages.map(p => p.itemNumber)) + 1 : 1;
        const newPkg: Record<string, unknown> = {
          name: fName.trim(),
          discipline: fDiscipline,
          itemNumber: nextItemNumber,
          milestones: emptyMilestones(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (quantity !== undefined && !isNaN(quantity) && quantity >= 1) newPkg.quantity = quantity;
        if (budget !== undefined && !isNaN(budget) && budget >= 0) newPkg.budget = budget;
        if (award !== undefined && !isNaN(award) && award >= 0) newPkg.awardValue = award;
        if (supplierId) { newPkg.awardedSupplierId = supplierId; newPkg.awardedSupplierName = supplierName; }
        if (fComment.trim()) newPkg.comment = fComment.trim();

        const docRef = await addDoc(collection(db, 'projects', projectId, 'packages'), newPkg);
        logAudit({
          action: 'package.created', category: 'schedule',
          targetCollection: `projects/${projectId}/packages`, targetDocId: docRef.id,
          clientId, details: { packageName: fName.trim(), discipline: fDiscipline },
        });
        toast({ title: 'Package Created', description: fName.trim() });
      }
      resetDialog();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to ${isEditMode ? 'update' : 'create'} package.` });
    }
  };

  const handleDeletePackage = async (pkg: EquipmentPackage) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'packages', pkg.id));
      logAudit({
        action: 'package.deleted', category: 'schedule',
        targetCollection: `projects/${projectId}/packages`, targetDocId: pkg.id,
        clientId, details: { packageName: pkg.name },
      });
      toast({ title: 'Package Deleted', description: pkg.name });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete package.' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Budget</p>
            <p className="text-lg font-semibold">{formatCurrency(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Awarded</p>
            <p className="text-lg font-semibold">{formatCurrency(totalAwarded)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Delta to Budget</p>
            <p className={`text-lg font-semibold flex items-center gap-1 ${totalDelta > 0 ? FINANCIAL_COLORS.underBudget : totalDelta < 0 ? FINANCIAL_COLORS.overBudget : FINANCIAL_COLORS.neutral}`}>
              {totalDelta > 0 ? <TrendingUp className="h-4 w-4" /> : totalDelta < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {formatCurrency(Math.abs(totalDelta))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Bought Out</p>
            <div className="flex items-center gap-2">
              <Progress value={boughtOutPct} className="h-2 flex-1" />
              <span className="text-sm font-semibold">{boughtOutPct}%</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{boughtOutCount} of {packages.length} packages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Units</p>
            <p className="text-lg font-semibold">{totalUnits > 0 ? totalUnits : '—'}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{packages.length} packages</p>
          </CardContent>
        </Card>
      </div>

      {/* Packages Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Packages</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={openCreateDialog}><Plus className="mr-1.5 h-4 w-4" /> Add Package</Button>
          )}
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2">#</TableHead>
                    <TableHead className="min-w-[140px]">Package</TableHead>
                    <TableHead className="w-12 text-center">Qty</TableHead>
                    <TableHead className="w-24">Discipline</TableHead>
                    <TableHead className="min-w-[120px]">Supplier</TableHead>
                    <TableHead className="w-20">RFP</TableHead>
                    <TableHead className="text-right w-24">Budget</TableHead>
                    <TableHead className="text-right w-24">Award</TableHead>
                    <TableHead className="text-right w-24">Delta</TableHead>
                    <TableHead className="w-32">Progress</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    {canEdit && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map(pkg => {
                    const pct = pkg.percentComplete ?? 0;
                    const rag = pkg.ragStatus ?? 'on-track';
                    const delta = (pkg.budget ?? 0) - ((pkg.awardValue ?? 0) + (pkg.changeOrderTotal ?? 0));
                    const hasBudget = pkg.budget !== undefined && pkg.budget > 0;
                    return (
                      <TableRow key={pkg.id} className="hover:bg-muted/20">
                        <TableCell className="text-xs px-2">{pkg.itemNumber}</TableCell>
                        <TableCell className="font-medium text-sm">{pkg.name}</TableCell>
                        <TableCell className="text-xs text-center tabular-nums">{pkg.quantity ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{pkg.discipline}</TableCell>
                        <TableCell className="text-xs">{pkg.awardedSupplierName ?? '—'}</TableCell>
                        <TableCell className="text-xs">
                          {pkg.associatedRfpId ? (
                            <Link to={`/dashboard/rfps/${pkg.associatedRfpId}`} className="text-primary hover:underline">View</Link>
                          ) : pkg.rfpIds && pkg.rfpIds.length > 0 ? (
                            <Link to={`/dashboard/rfps/${pkg.rfpIds[0]}`} className="text-primary hover:underline">View</Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatCurrency(pkg.budget)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatCurrency(pkg.awardValue)}</TableCell>
                        <TableCell className={`text-right text-xs tabular-nums ${hasBudget ? (delta > 0 ? FINANCIAL_COLORS.underBudget : delta < 0 ? FINANCIAL_COLORS.overBudget : FINANCIAL_COLORS.neutral) : ''}`}>
                          {hasBudget ? formatCurrency(Math.abs(delta)) : '—'}
                          {hasBudget && delta > 0 && ' ▲'}
                          {hasBudget && delta < 0 && ' ▼'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2 flex-1" />
                            <span className="text-xs tabular-nums">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${RAG_COLORS[rag]} text-white text-xs px-2.5 py-0.5 whitespace-nowrap`}>{rag}</Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(pkg)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeletePackage(pkg)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified Package Dialog (Create + Edit) */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditMode ? `Edit Package: ${dialogPkg?.name}` : 'New Package'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium">Package Name *</label>
                <Input placeholder="e.g., Air-Cooled Chillers" value={fName} onChange={(e) => setFName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium">Quantity</label>
                <Input type="number" min={1} step={1} placeholder="1" value={fQuantity} onChange={(e) => setFQuantity(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Discipline *</label>
              <Select value={fDiscipline} onValueChange={setFDiscipline}>
                <SelectTrigger><SelectValue placeholder="Discipline" /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium">Budget ($)</label>
                <Input type="number" min={0} placeholder="0" value={fBudget} onChange={(e) => setFBudget(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium">Award Value ($)</label>
                <Input type="number" min={0} placeholder="0" value={fAward} onChange={(e) => setFAward(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Awarded Supplier</label>
              <Select value={fSupplierId || '__none'} onValueChange={setFSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No supplier assigned</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Comment</label>
              <Input placeholder="Notes..." value={fComment} onChange={(e) => setFComment(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancel</Button>
            <Button onClick={handleSavePackage} disabled={!fName.trim() || !fDiscipline}>
              {isEditMode ? 'Save Changes' : 'Create Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
