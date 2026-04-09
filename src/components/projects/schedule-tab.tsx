import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { EquipmentPackage, Supplier } from '@/types';
import { MILESTONE_KEYS, MILESTONE_LABELS, DISCIPLINES } from '@/types';
import { recomputePackageMetrics } from '@/lib/schedule-engine';
import { db } from '@/lib/firebase';
import { doc, updateDoc, addDoc, deleteDoc, collection, onSnapshot, serverTimestamp } from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import {
  processImportRows, readFileToRows, emptyMilestones,
  type ValidationError,
} from '@/lib/schedule-import-export';

import { ScheduleTable } from '@/components/projects/schedule-table';
import { GanttChart } from '@/components/projects/schedule-gantt';
import { ManageMilestonesDialog, IconPicker } from '@/components/projects/schedule-milestones-dialog';
import { ManagePackagesDialog } from '@/components/projects/schedule-manage-packages-dialog';
import { AutoGenerateScheduleDialog, useAutoGenerateSchedule } from '@/components/projects/schedule-auto-generate-dialog';
import { ScheduleToolbar } from '@/components/projects/schedule-toolbar';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';

export interface ScheduleTabProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
  projectName: string;
}

export function ScheduleTab({ projectId, clientId, packages, canEdit, projectName }: ScheduleTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Suppliers ----
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    });
    return () => unsub();
  }, []);

  // ---- View state ----
  const [view, setView] = useState<'table' | 'gantt'>('table');
  const [activeDateTypes, setActiveDateTypes] = useState<Set<'planned' | 'forecast' | 'actual'>>(new Set(['planned']));
  const [showExtraColumns, setShowExtraColumns] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // ---- Milestone management ----
  const [milestoneKeys, setMilestoneKeys] = useState<string[]>([...MILESTONE_KEYS]);
  const [milestoneLabels, setMilestoneLabels] = useState<Record<string, string>>({ ...MILESTONE_LABELS });
  const [milestoneIcons, setMilestoneIcons] = useState<Record<string, string>>({});
  const [visibleMilestones, setVisibleMilestones] = useState<Set<string>>(new Set(MILESTONE_KEYS));

  const [milestoneFilterOpen, setMilestoneFilterOpen] = useState(false);
  const [manageMilestonesOpen, setManageMilestonesOpen] = useState(false);
  const [managePkgsOpen, setManagePkgsOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [importErrorsOpen, setImportErrorsOpen] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneIcon, setNewMilestoneIcon] = useState('Play');
  const [saving, setSaving] = useState(false);
  const [importErrors, setImportErrors] = useState<ValidationError[]>([]);

  // ---- Date reset ----
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<EquipmentPackage | null>(null); // null = all packages
  const [resetPlanned, setResetPlanned] = useState(true);
  const [resetForecast, setResetForecast] = useState(true);
  const [resetActual, setResetActual] = useState(true);

  // ---- Load saved milestone config from project document ----
  const [savedConfigLoaded, setSavedConfigLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const { getDoc } = await import('firebase/firestore');
        const projSnap = await getDoc(doc(db, 'projects', projectId));
        if (cancelled || !projSnap.exists()) return;
        const data = projSnap.data();
        if (data.milestoneOrder && Array.isArray(data.milestoneOrder)) {
          setMilestoneKeys(data.milestoneOrder);
          setVisibleMilestones(new Set(data.milestoneOrder));
        }
        if (data.milestoneLabels) setMilestoneLabels(prev => ({ ...prev, ...data.milestoneLabels }));
        if (data.milestoneIcons) setMilestoneIcons(data.milestoneIcons);
      } catch { /* ignore */ }
      if (!cancelled) setSavedConfigLoaded(true);
    }
    loadConfig();
    return () => { cancelled = true; };
  }, [projectId]);

  // ---- Discover new milestones from package data (additive — doesn't override saved order) ----
  useEffect(() => {
    if (!savedConfigLoaded) return; // Wait for saved config to load first
    const existing = new Set(milestoneKeys);
    let changed = false;
    packages.forEach(p => {
      Object.keys(p.milestones || {}).forEach(k => {
        if (!existing.has(k)) { existing.add(k); changed = true; }
      });
    });
    if (changed) {
      const keysArr = Array.from(existing);
      setMilestoneKeys(keysArr);
      setVisibleMilestones(prev => {
        const next = new Set(prev);
        keysArr.forEach(k => next.add(k));
        return next;
      });
    }
    // Always update labels for any new keys
    setMilestoneLabels(prev => {
      const next = { ...prev };
      milestoneKeys.forEach(k => {
        if (!next[k]) next[k] = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      });
      return next;
    });
  }, [packages, savedConfigLoaded, milestoneKeys]);

  const allDisciplines = useMemo(() => {
    const base = [...DISCIPLINES] as string[];
    packages.forEach(p => { if (p.discipline && !base.includes(p.discipline)) base.push(p.discipline); });
    return base;
  }, [packages]);

  // ---- Toggles ----
  const toggleDateType = (dt: 'planned' | 'forecast' | 'actual') => {
    setActiveDateTypes(prev => { const n = new Set(prev); if (n.has(dt)) { if (n.size > 1) n.delete(dt); } else n.add(dt); return n; });
  };
  const toggleGroup = (g: string) => { setCollapsedGroups(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; }); };

  // ---- Filtered + grouped ----
  const filteredMilestoneKeys = useMemo(() => milestoneKeys.filter(k => visibleMilestones.has(k)), [milestoneKeys, visibleMilestones]);
  const visibleDateTypesArr = useMemo(() => {
    const order = ['planned', 'forecast', 'actual'] as const;
    return Array.from(activeDateTypes).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [activeDateTypes]);

  const filteredPackages = useMemo(() =>
    packages.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.awardedSupplierName && p.awardedSupplierName.toLowerCase().includes(searchTerm.toLowerCase())),
    ),
  [packages, searchTerm]);

  const groupedPackages = useMemo(() => {
    const groups: Record<string, EquipmentPackage[]> = { Mechanical: [], Electrical: [], Civil: [], Others: [] };
    filteredPackages.forEach(p => {
      const g = (DISCIPLINES as readonly string[]).includes(p.discipline) ? p.discipline : 'Others';
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });
    return groups;
  }, [filteredPackages]);

  // ---- Firestore writes ----
  const updatePackageDoc = useCallback(async (pkgId: string, data: Record<string, any>) => {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'packages', pkgId), { ...data, updatedAt: serverTimestamp() });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to update package.' });
    }
  }, [projectId, toast]);

  const handleUpdateMilestone = useCallback(async (pkgId: string, msKey: string, dateType: string, value: string) => {
    const pkg = packages.find(p => p.id === pkgId);
    if (!pkg) return;
    const updated = {
      ...pkg.milestones,
      [msKey]: {
        ...(pkg.milestones[msKey] || { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' }),
        [dateType]: value,
      },
    };
    const metrics = recomputePackageMetrics({ ...pkg, milestones: updated }, milestoneKeys);
    await updatePackageDoc(pkgId, { milestones: updated, ...metrics });
    logAudit({
      action: 'schedule.milestone_updated',
      category: 'schedule',
      targetCollection: `projects/${projectId}/packages`,
      targetDocId: pkgId,
      clientId,
      details: { packageName: pkg.name, milestone: msKey, dateType, value },
    });
    toast({ title: '\u2713 Saved', duration: 1500 });
  }, [packages, milestoneKeys, projectId, clientId, updatePackageDoc, toast]);

  const handleUpdatePackageField = useCallback(async (pkgId: string, field: string, value: string) => {
    const pkg = packages.find(p => p.id === pkgId);
    if (!pkg) return;
    if (field === '__delete') {
      try {
        await deleteDoc(doc(db, 'projects', projectId, 'packages', pkgId));
        logAudit({
          action: 'package.deleted',
          category: 'schedule',
          targetCollection: `projects/${projectId}/packages`,
          targetDocId: pkgId,
          clientId,
          details: { packageName: pkg.name },
        });
        toast({ title: 'Package deleted', description: pkg.name });
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete package.' });
      }
      return;
    }
    await updatePackageDoc(pkgId, { [field]: value });
    toast({ title: '\u2713 Saved', duration: 1500 });
  }, [packages, projectId, clientId, updatePackageDoc, toast]);

  // ---- Auto-generate schedule (hook) ----
  const autoGen = useAutoGenerateSchedule({
    projectId, clientId, milestoneKeys, milestoneLabels,
    onUpdatePackageDoc: updatePackageDoc,
  });

  // ---- Package CRUD ----
  const addPackage = useCallback(async (name: string, discipline: string) => {
    const ms = emptyMilestones(milestoneKeys);
    const docRef = await addDoc(collection(db, 'projects', projectId, 'packages'), {
      name,
      discipline,
      itemNumber: packages.length > 0 ? Math.max(...packages.map(p => p.itemNumber)) + 1 : 1,
      milestones: ms,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    logAudit({ action: 'schedule.package_added', category: 'schedule', targetCollection: `projects/${projectId}/packages`, targetDocId: docRef.id, clientId, details: { packageName: name } });
    toast({ title: 'Package added' });
  }, [milestoneKeys, packages.length, projectId, clientId, toast]);

  const deletePackage = useCallback(async (pkgId: string) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'packages', pkgId));
      logAudit({
        action: 'package.deleted',
        category: 'schedule',
        targetCollection: `projects/${projectId}/packages`,
        targetDocId: pkgId,
        clientId,
        details: { packageName: packages.find(p => p.id === pkgId)?.name },
      });
      toast({ title: 'Package deleted' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  }, [projectId, clientId, packages, toast]);

  // ---- Milestone CRUD ----
  const addMilestone = useCallback(() => {
    if (!newMilestoneName.trim()) return;
    const key = newMilestoneName.trim().replace(/\s+/g, '').replace(/^(.)/, (_, c) => c.toLowerCase());
    if (milestoneKeys.includes(key)) { toast({ variant: 'destructive', title: 'Milestone already exists' }); return; }
    setMilestoneKeys(prev => [...prev, key]);
    setMilestoneLabels(prev => ({ ...prev, [key]: newMilestoneName.trim() }));
    setMilestoneIcons(prev => ({ ...prev, [key]: newMilestoneIcon }));
    setVisibleMilestones(prev => new Set([...prev, key]));
    // Add empty milestone data to all existing packages
    packages.forEach(pkg => {
      updatePackageDoc(pkg.id, { [`milestones.${key}`]: { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' } });
    });
    setNewMilestoneName('');
    setAddMilestoneOpen(false);
  }, [newMilestoneName, newMilestoneIcon, milestoneKeys, packages, updatePackageDoc, toast]);

  const deleteMilestone = useCallback((key: string) => {
    setMilestoneKeys(prev => prev.filter(k => k !== key));
    setVisibleMilestones(prev => { const n = new Set(prev); n.delete(key); return n; });
    // Note: Does not remove from Firestore docs — just hides the column
  }, []);

  // ---- Date reset handlers ----
  async function handleResetDates() {
    const targets = resetTarget ? [resetTarget] : packages;
    for (const pkg of targets) {
      const updated = { ...pkg.milestones };
      for (const key of milestoneKeys) {
        const ms = updated[key] || { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
        updated[key] = {
          plannedDate: resetPlanned ? 'TBD' : ms.plannedDate,
          adjustedDate: resetForecast ? 'TBD' : ms.adjustedDate,
          actualDate: resetActual ? 'TBD' : ms.actualDate,
        };
      }
      const metrics = recomputePackageMetrics({ ...pkg, milestones: updated }, milestoneKeys);
      await updatePackageDoc(pkg.id, { milestones: updated, ...metrics });
    }
    logAudit({
      action: 'schedule.dates_reset',
      category: 'schedule',
      targetCollection: `projects/${projectId}/packages`,
      targetDocId: resetTarget?.id || 'all',
      clientId,
      details: {
        packageName: resetTarget?.name || 'All packages',
        resetPlanned, resetForecast, resetActual,
        count: targets.length,
      },
    });
    toast({ title: 'Dates Reset', description: `Reset ${targets.length} package(s) to TBD.` });
    setResetOpen(false);
    setResetTarget(null);
  }

  function openResetPkg(pkg: EquipmentPackage) {
    setResetTarget(pkg);
    setResetPlanned(true);
    setResetForecast(true);
    setResetActual(true);
    setResetOpen(true);
  }

  function openResetAll() {
    setResetTarget(null);
    setResetPlanned(true);
    setResetForecast(true);
    setResetActual(true);
    setResetOpen(true);
  }

  // ---- Import ----
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isExcel = ext === 'xlsx' || ext === 'xls';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rows = readFileToRows(ev.target?.result as (ArrayBuffer | string), isExcel);
        const { imported, errors, warnings, stats } = processImportRows(rows, milestoneKeys, milestoneLabels, packages, allDisciplines);

        if (errors.length > 0) {
          setImportErrors(errors);
          setImportErrorsOpen(true);
          toast({ variant: 'destructive', title: 'Import Validation Failed', description: `Found ${errors.length} error(s). Please review and fix them.` });
          return;
        }

        if (imported.length) {
          setSaving(true);
          const existingByName = new Map(packages.map(p => [p.name.toLowerCase(), p]));
          for (const pkg of imported) {
            const existing = existingByName.get(pkg.name.toLowerCase());
            if (existing) {
              await updateDoc(doc(db, 'projects', projectId, 'packages', existing.id), {
                milestones: pkg.milestones,
                awardedSupplierName: pkg.awardedSupplierName || existing.awardedSupplierName,
                discipline: pkg.discipline || existing.discipline,
                comment: pkg.comment || existing.comment,
                updatedAt: serverTimestamp(),
              });
              logAudit({
                action: 'package.imported_update',
                category: 'schedule',
                targetCollection: `projects/${projectId}/packages`,
                targetDocId: existing.id,
                clientId,
                details: { packageName: pkg.name },
              });
            } else {
              const ref = await addDoc(collection(db, 'projects', projectId, 'packages'), {
                name: pkg.name,
                discipline: pkg.discipline || 'Others',
                itemNumber: packages.length > 0 ? Math.max(...packages.map(p => p.itemNumber)) + 1 : 1,
                milestones: pkg.milestones,
                awardedSupplierName: pkg.awardedSupplierName,
                comment: pkg.comment,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              logAudit({
                action: 'package.imported_new',
                category: 'schedule',
                targetCollection: `projects/${projectId}/packages`,
                targetDocId: ref.id,
                clientId,
                details: { packageName: pkg.name },
              });
            }
          }
          setSaving(false);
          const parts: string[] = [];
          if (stats.added > 0) parts.push(`${stats.added} added`);
          if (stats.updated > 0) parts.push(`${stats.updated} updated`);
          if (stats.unchanged > 0) parts.push(`${stats.unchanged} unchanged`);
          toast({ title: 'Import Successful', description: parts.join(', ') + '.' });
          if (warnings.length > 0) { setImportErrors(warnings); setImportErrorsOpen(true); }
        }
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Import Error', description: err.message || 'Failed to parse file.' });
      }
    };
    reader.onerror = () => toast({ variant: 'destructive', title: 'Error', description: 'Failed to read file.' });
    if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [milestoneKeys, milestoneLabels, packages, allDisciplines, projectId, toast]);

  // ---- Render ----
  return (
    <div className="space-y-3">
      {/* ============ TOOLBAR ============ */}
      <ScheduleToolbar
        activeDateTypes={activeDateTypes}
        onToggleDateType={toggleDateType}
        milestoneFilterOpen={milestoneFilterOpen}
        onMilestoneFilterOpenChange={setMilestoneFilterOpen}
        milestoneKeys={milestoneKeys}
        visibleMilestones={visibleMilestones}
        onSetVisibleMilestones={setVisibleMilestones}
        milestoneLabels={milestoneLabels}
        onDeleteMilestone={deleteMilestone}
        onOpenAddMilestone={() => setAddMilestoneOpen(true)}
        view={view}
        onSetView={setView}
        showExtraColumns={showExtraColumns}
        onToggleExtraColumns={() => setShowExtraColumns(!showExtraColumns)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        packages={packages}
        projectName={projectName}
        filteredMilestoneKeys={filteredMilestoneKeys}
        fileInputRef={fileInputRef}
        onImport={handleImport}
        onOpenManageMilestones={() => setManageMilestonesOpen(true)}
        canEdit={canEdit}
        onOpenManagePackages={() => setManagePkgsOpen(true)}
        saving={saving}
        onResetAllDates={canEdit ? openResetAll : undefined}
      />

      {/* ============ MAIN VIEW ============ */}
      {view === 'table' ? (
        <ScheduleTable
          groupedPackages={groupedPackages}
          suppliers={suppliers}
          milestoneKeys={filteredMilestoneKeys}
          milestoneLabels={milestoneLabels}
          milestoneIcons={milestoneIcons}
          visibleDateTypes={visibleDateTypesArr}
          collapsedGroups={collapsedGroups}
          toggleGroup={toggleGroup}
          showExtraColumns={showExtraColumns}
          canEdit={canEdit}
          onUpdateMilestone={handleUpdateMilestone}
          onUpdatePackageField={handleUpdatePackageField}
          onAutoGenerate={canEdit ? autoGen.openAutoGen : undefined}
          onResetDates={canEdit ? openResetPkg : undefined}
        />
      ) : (
        <GanttChart
          groupedPackages={groupedPackages}
          milestoneKeys={filteredMilestoneKeys}
          milestoneLabels={milestoneLabels}
          milestoneIcons={milestoneIcons}
          visibleDateTypes={visibleDateTypesArr}
          collapsedGroups={collapsedGroups}
          toggleGroup={toggleGroup}
          packagesCount={filteredPackages.length}
        />
      )}

      {/* ============ MANAGE PACKAGES DIALOG ============ */}
      <ManagePackagesDialog
        open={managePkgsOpen}
        onOpenChange={setManagePkgsOpen}
        packages={packages}
        allDisciplines={allDisciplines}
        onUpdateDiscipline={(pkgId, val) => updatePackageDoc(pkgId, { discipline: val })}
        onDeletePackage={deletePackage}
        onAddPackage={addPackage}
      />

      {/* ============ ADD MILESTONE DIALOG ============ */}
      <Dialog open={addMilestoneOpen} onOpenChange={setAddMilestoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
            <DialogDescription>Create a new milestone column for all packages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Milestone Name</Label>
              <Input placeholder="e.g., Quality Inspection" value={newMilestoneName} onChange={e => setNewMilestoneName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Select Icon</Label>
              <IconPicker value={newMilestoneIcon} onChange={setNewMilestoneIcon} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMilestoneOpen(false)}>Cancel</Button>
            <Button onClick={addMilestone} disabled={!newMilestoneName.trim()}>Add Milestone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MANAGE MILESTONES DIALOG ============ */}
      <ManageMilestonesDialog
        open={manageMilestonesOpen}
        onOpenChange={setManageMilestonesOpen}
        milestoneKeys={milestoneKeys}
        milestoneLabels={milestoneLabels}
        milestoneIcons={milestoneIcons}
        onSave={async (newOrder, newLabels, newIcons) => {
          setMilestoneKeys(newOrder);
          setMilestoneLabels(newLabels);
          setMilestoneIcons(newIcons);
          // Persist to project document so order survives page reload
          try {
            await updateDoc(doc(db, 'projects', projectId), {
              milestoneOrder: newOrder,
              milestoneLabels: newLabels,
              milestoneIcons: newIcons,
              updatedAt: serverTimestamp(),
            });
          } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to save milestone order.' });
          }
        }}
        onDelete={deleteMilestone}
      />

      {/* ============ IMPORT ERRORS DIALOG ============ */}
      <Dialog open={importErrorsOpen} onOpenChange={setImportErrorsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <DialogTitle>Import Validation Issues</DialogTitle>
            </div>
            <DialogDescription>
              Issues were found in your file. Please review and fix them in your Excel sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md mt-4">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold border-b border-r w-16">Row</th>
                  <th className="px-3 py-2 text-left font-semibold border-b border-r w-32">Column</th>
                  <th className="px-3 py-2 text-left font-semibold border-b border-r">Issue</th>
                  <th className="px-3 py-2 text-left font-semibold border-b">Value</th>
                </tr>
              </thead>
              <tbody>
                {importErrors.map((err, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2 border-r font-mono text-muted-foreground">{err.row}</td>
                    <td className="px-3 py-2 border-r font-medium">{err.column}</td>
                    <td className="px-3 py-2 border-r text-destructive">{err.message}</td>
                    <td className="px-3 py-2 bg-muted/20 italic truncate max-w-[150px]" title={err.value}>{err.value || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => setImportErrorsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ RESET DATES DIALOG ============ */}
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!open) { setResetOpen(false); setResetTarget(null); setResetPlanned(true); setResetForecast(true); setResetActual(true); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-500">
              Reset Dates: {resetTarget ? resetTarget.name : 'All Packages'}
            </DialogTitle>
            <DialogDescription>
              This will set selected date types back to TBD. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">Select which date types to reset:</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={resetPlanned} onChange={e => setResetPlanned(e.target.checked)} className="rounded" />
              Planned dates
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={resetForecast} onChange={e => setResetForecast(e.target.checked)} className="rounded" />
              Forecast dates
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={resetActual} onChange={e => setResetActual(e.target.checked)} className="rounded" />
              Actual dates
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetOpen(false); setResetTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetDates} disabled={!resetPlanned && !resetForecast && !resetActual}>
              Reset {resetTarget ? '1 Package' : `${packages.length} Packages`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ AUTO-GENERATE SCHEDULE DIALOG ============ */}
      <AutoGenerateScheduleDialog
        open={autoGen.autoGenOpen}
        onOpenChange={(open) => { if (!open) { autoGen.setAutoGenOpen(false); autoGen.setAutoGenPkg(null); } }}
        pkg={autoGen.autoGenPkg}
        mode={autoGen.autoGenMode}
        onModeChange={autoGen.setAutoGenMode}
        date={autoGen.autoGenDate}
        onDateChange={autoGen.setAutoGenDate}
        leadTime={autoGen.autoGenLeadTime}
        onLeadTimeChange={autoGen.setAutoGenLeadTime}
        durations={autoGen.autoGenDurations}
        onDurationsChange={autoGen.setAutoGenDurations}
        saving={autoGen.autoGenSaving}
        projectedDelivery={autoGen.projectedDelivery}
        rojDelta={autoGen.rojDelta}
        milestoneKeys={milestoneKeys}
        milestoneLabels={milestoneLabels}
        onGenerate={autoGen.handleAutoGenerate}
        onClose={() => { autoGen.setAutoGenOpen(false); autoGen.setAutoGenPkg(null); }}
      />
    </div>
  );
}
