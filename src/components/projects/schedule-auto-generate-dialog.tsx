import React, { useState, useMemo, useCallback } from 'react';
import type { EquipmentPackage } from '@/types';
import { DEFAULT_MILESTONE_DURATIONS } from '@/types';
import { generateBackwardPassSchedule, generateForwardPassSchedule, recomputePackageMetrics } from '@/lib/schedule-engine';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AutoGenerateScheduleDialogProps {
  projectId: string;
  clientId: string;
  milestoneKeys: string[];
  milestoneLabels: Record<string, string>;
  onUpdatePackageDoc: (pkgId: string, data: Record<string, any>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook: useAutoGenerateSchedule
// ---------------------------------------------------------------------------

export function useAutoGenerateSchedule({ projectId, clientId, milestoneKeys, milestoneLabels, onUpdatePackageDoc }: AutoGenerateScheduleDialogProps) {
  const { toast } = useToast();

  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [autoGenPkg, setAutoGenPkg] = useState<EquipmentPackage | null>(null);
  const [autoGenMode, setAutoGenMode] = useState<'backward' | 'forward'>('backward');
  const [autoGenDate, setAutoGenDate] = useState('');
  const [autoGenLeadTime, setAutoGenLeadTime] = useState(20);
  const [autoGenDurations, setAutoGenDurations] = useState<Record<string, number>>({ ...DEFAULT_MILESTONE_DURATIONS });
  const [autoGenSaving, setAutoGenSaving] = useState(false);

  const openAutoGen = useCallback((pkg: EquipmentPackage) => {
    setAutoGenPkg(pkg);
    setAutoGenMode('backward');
    setAutoGenDate(pkg.rojDate || '');
    setAutoGenLeadTime(pkg.leadTimeWeeks || 20);
    setAutoGenDurations(pkg.milestoneDurations || { ...DEFAULT_MILESTONE_DURATIONS });
    setAutoGenOpen(true);
  }, []);

  const autoGenPreview = useMemo(() => {
    if (!autoGenDate || !autoGenPkg) return null;
    const durations = { ...DEFAULT_MILESTONE_DURATIONS, ...autoGenDurations };
    durations.production = autoGenLeadTime * 5;
    if (autoGenMode === 'backward') {
      return generateBackwardPassSchedule(autoGenDate, autoGenLeadTime, durations, milestoneKeys);
    }
    return generateForwardPassSchedule(autoGenDate, autoGenLeadTime, durations, milestoneKeys);
  }, [autoGenDate, autoGenLeadTime, autoGenDurations, autoGenMode, autoGenPkg, milestoneKeys]);

  const projectedDelivery = autoGenMode === 'forward' && autoGenPreview?.delivery && autoGenPreview.delivery !== 'TBD'
    ? autoGenPreview.delivery : null;

  const rojDelta = useMemo(() => {
    if (!projectedDelivery || !autoGenPkg?.rojDate || autoGenPkg.rojDate === 'TBD') return null;
    const delivery = new Date(projectedDelivery);
    const roj = new Date(autoGenPkg.rojDate);
    const diffDays = Math.round((roj.getTime() - delivery.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [projectedDelivery, autoGenPkg?.rojDate]);

  const handleAutoGenerate = useCallback(async () => {
    if (!autoGenPkg || !autoGenDate) return;
    setAutoGenSaving(true);
    try {
      let generated: Record<string, string>;
      if (autoGenMode === 'backward') {
        generated = generateBackwardPassSchedule(autoGenDate, autoGenLeadTime, autoGenDurations, milestoneKeys);
      } else {
        generated = generateForwardPassSchedule(autoGenDate, autoGenLeadTime, autoGenDurations, milestoneKeys);
      }

      const updatedMilestones = { ...autoGenPkg.milestones };
      for (const key of milestoneKeys) {
        const existing = updatedMilestones[key] || { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
        const genDate = generated[key];
        if (genDate && genDate !== 'TBD') {
          updatedMilestones[key] = {
            ...existing,
            plannedDate: existing.plannedDate === 'TBD' ? genDate : existing.plannedDate,
          };
        } else {
          updatedMilestones[key] = existing;
        }
      }

      const metrics = recomputePackageMetrics({ ...autoGenPkg, milestones: updatedMilestones }, milestoneKeys);

      const updateData: Record<string, unknown> = {
        leadTimeWeeks: autoGenLeadTime,
        milestoneDurations: autoGenDurations,
        milestones: updatedMilestones,
        ...metrics,
      };
      if (autoGenMode === 'backward') {
        updateData.rojDate = autoGenDate;
      } else if (projectedDelivery) {
        updateData.rojDate = projectedDelivery;
      }

      await onUpdatePackageDoc(autoGenPkg.id, updateData as Record<string, any>);

      logAudit({
        action: 'schedule.auto_generated',
        category: 'schedule',
        targetCollection: `projects/${projectId}/packages`,
        targetDocId: autoGenPkg.id,
        clientId,
        details: {
          packageName: autoGenPkg.name,
          mode: autoGenMode,
          inputDate: autoGenDate,
          leadTimeWeeks: autoGenLeadTime,
          ...(projectedDelivery && { projectedDelivery }),
        },
      });

      toast({ title: 'Schedule Generated', description: `${autoGenMode === 'backward' ? 'Backward' : 'Forward'}-pass dates for ${autoGenPkg.name}.` });
      setAutoGenOpen(false);
      setAutoGenPkg(null);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate schedule.' });
    } finally {
      setAutoGenSaving(false);
    }
  }, [autoGenPkg, autoGenDate, autoGenMode, autoGenLeadTime, autoGenDurations, milestoneKeys, projectId, clientId, projectedDelivery, onUpdatePackageDoc, toast]);

  return {
    autoGenOpen, setAutoGenOpen, autoGenPkg, setAutoGenPkg,
    autoGenMode, setAutoGenMode, autoGenDate, setAutoGenDate,
    autoGenLeadTime, setAutoGenLeadTime, autoGenDurations, setAutoGenDurations,
    autoGenSaving, projectedDelivery, rojDelta,
    openAutoGen, handleAutoGenerate,
  };
}

// ---------------------------------------------------------------------------
// Dialog Component
// ---------------------------------------------------------------------------

export interface AutoGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: EquipmentPackage | null;
  mode: 'backward' | 'forward';
  onModeChange: (m: 'backward' | 'forward') => void;
  date: string;
  onDateChange: (d: string) => void;
  leadTime: number;
  onLeadTimeChange: (n: number) => void;
  durations: Record<string, number>;
  onDurationsChange: (d: Record<string, number>) => void;
  saving: boolean;
  projectedDelivery: string | null;
  rojDelta: number | null;
  milestoneKeys: string[];
  milestoneLabels: Record<string, string>;
  onGenerate: () => void;
  onClose: () => void;
}

export function AutoGenerateScheduleDialog({
  open, onOpenChange, pkg, mode, onModeChange, date, onDateChange,
  leadTime, onLeadTimeChange, durations, onDurationsChange,
  saving, projectedDelivery, rojDelta,
  milestoneKeys, milestoneLabels, onGenerate, onClose,
}: AutoGenerateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auto-Generate Schedule{pkg ? `: ${pkg.name}` : ''}</DialogTitle>
          <DialogDescription>Enter dates and milestone durations to auto-generate a schedule. Only empty (TBD) dates will be populated — your existing dates will not be changed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Direction toggle */}
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
            <Button variant={mode === 'backward' ? 'default' : 'ghost'} size="sm" className="flex-1 h-8 text-xs" onClick={() => onModeChange('backward')}>
              ← Backward (from ROJ)
            </Button>
            <Button variant={mode === 'forward' ? 'default' : 'ghost'} size="sm" className="flex-1 h-8 text-xs" onClick={() => onModeChange('forward')}>
              Forward (from Start) →
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium">
                {mode === 'backward' ? 'Required on Job (ROJ) Date' : 'Project Start Date'}
              </label>
              <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Lead Time (weeks)</label>
              <Input type="number" min={1} value={leadTime} onChange={(e) => onLeadTimeChange(parseInt(e.target.value) || 1)} />
            </div>
          </div>

          {/* Forward-pass: show projected delivery + ROJ delta */}
          {mode === 'forward' && projectedDelivery && (
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="text-xs font-medium">Projected Delivery: <span className="text-primary">{projectedDelivery}</span></div>
              {rojDelta !== null && (
                <div className={`text-xs ${rojDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {rojDelta >= 0
                    ? `${rojDelta} days before ROJ (${pkg?.rojDate}) — on track`
                    : `${Math.abs(rojDelta)} days after ROJ (${pkg?.rojDate}) — schedule at risk`}
                </div>
              )}
              {rojDelta === null && pkg?.rojDate && pkg.rojDate !== 'TBD' && (
                <div className="text-xs text-muted-foreground">ROJ: {pkg.rojDate}</div>
              )}
              {(!pkg?.rojDate || pkg.rojDate === 'TBD') && (
                <div className="text-xs text-muted-foreground">No ROJ date set — projected delivery will be saved as ROJ</div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium mb-2 block">Milestone Durations (business days)</label>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {milestoneKeys.filter(k => k !== 'production' && k !== 'delivery').map(key => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground flex-1">{milestoneLabels[key] || key}</span>
                  <Input
                    type="number" min={0} className="w-20 h-7 text-xs"
                    value={durations[key] ?? DEFAULT_MILESTONE_DURATIONS[key] ?? 0}
                    onChange={(e) => onDurationsChange({ ...durations, [key]: parseInt(e.target.value) || 0 })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 opacity-50">
                <span className="text-xs text-muted-foreground flex-1">Production</span>
                <span className="text-xs w-20 text-center">{leadTime * 5} days</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onGenerate} disabled={!date || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generate {mode === 'backward' ? 'Backward' : 'Forward'} Pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
