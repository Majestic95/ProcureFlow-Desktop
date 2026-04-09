import React, { useState } from 'react';
import type { EquipmentPackage, Supplier, MilestoneData } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  ChevronRight, ChevronDown, Trash2, Wand2, RotateCcw,
  Play, FileSearch, Gavel, Microscope, FileOutput, FileSignature,
  PackageCheck, UserCheck, PenLine, Receipt, Upload, Ruler, Factory,
  Truck, Flag, CheckCircle, Clock, Calendar, Star, Zap, Target,
  ClipboardCheck, Settings2, Ship, Plane, Box, ShoppingCart, Wallet,
  CreditCard, TrendingUp, AlertCircle, Info, HelpCircle, Lightbulb,
  Database, Cpu, HardDrive, Layers as LayersIcon,
  BarChart3,
} from 'lucide-react';

// --- Constants ---

const GANTT_COLORS: Record<string, string> = {
  Mechanical: '#0ea5e9', Electrical: '#f59e0b', Civil: '#10b981', Others: '#8b5cf6',
};

const DATE_TYPE_COLORS = {
  planned: '#3b82f6', forecast: '#93c5fd', actual: '#ec4899',
};

const MILESTONE_ICONS_MAP: Record<string, string> = {
  projectStart: 'Play', prePurchaseSpec: 'FileSearch', biddingPeriod: 'Gavel',
  analysisPeriod: 'BarChart3', techReviewPeriod: 'Microscope', loiReleasePeriod: 'FileOutput',
  contractPeriod: 'FileSignature', procurementRecProcess: 'PackageCheck', vendorSelection: 'UserCheck',
  timeToSign: 'PenLine', poIssue: 'Receipt', submittalPeriod: 'Upload',
  shopDrawingReview: 'Ruler', production: 'Factory', delivery: 'Truck',
};

const ICON_LIBRARY: Record<string, any> = {
  Play, FileSearch, Gavel, Microscope, FileOutput, FileSignature, PackageCheck,
  UserCheck, PenLine, Receipt, Upload, Ruler, Factory, Truck, Flag, CheckCircle,
  Clock, Calendar, Star, Zap, Target, ClipboardCheck, Settings2,
  Ship, Plane, Box, ShoppingCart, Wallet, CreditCard, TrendingUp, AlertCircle,
  Info, HelpCircle, Lightbulb, Database, Cpu, HardDrive, Layers: LayersIcon,
  BarChart3,
};

// --- Helpers ---

function parseTypedDate(raw: string): string {
  if (!raw || raw === 'TBD' || raw === 'N/A') return raw || 'TBD';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return raw;
}

/** Comment cell with local state — syncs to Firestore on blur to prevent cursor jumping */
function CommentCell({ pkgId, initialValue, onSave }: { pkgId: string; initialValue: string; onSave: (val: string) => void }) {
  const [local, setLocal] = useState(initialValue);
  const [dirty, setDirty] = useState(false);
  const [focusedValue, setFocusedValue] = useState(initialValue);

  // Update local state when Firestore data changes (only if user hasn't made unsaved edits)
  // When dirty and Firestore confirms our save (initialValue matches local), clear dirty flag
  React.useEffect(() => {
    if (!dirty) setLocal(initialValue);
    if (dirty && initialValue === local) setDirty(false);
  }, [initialValue, dirty, local]);

  return (
    <textarea
      className="w-full min-h-[28px] max-h-[100px] text-[10px] bg-transparent border-none focus:ring-1 focus:ring-primary rounded p-1 resize-y"
      placeholder="Add comment..."
      value={local}
      onChange={e => { setLocal(e.target.value); setDirty(true); }}
      onFocus={() => setFocusedValue(local)}
      onBlur={() => {
        if (local !== focusedValue) {
          onSave(local);
          // Dirty flag stays true until Firestore confirms (initialValue matches local in useEffect)
        } else {
          setDirty(false);
        }
      }}
    />
  );
}

function formatDisplay(val: string) {
  if (val === 'TBD' || val === 'N/A') return val;
  try {
    const d = new Date(val + 'T00:00:00');
    if (isNaN(d.getTime())) return val;
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const yy = d.getFullYear().toString().slice(-2);
    return `${mm}/${dd}/${yy}`;
  } catch { return val; }
}

// --- Sub-components ---

function DateInput({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (editing) {
    return (
      <Input
        className="h-7 text-xs" value={text} autoFocus placeholder="MM/DD/YYYY"
        onChange={e => setText(e.target.value)}
        onBlur={() => { onChange(parseTypedDate(text)); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange(parseTypedDate(text)); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex gap-0.5 flex-1">
      <button
        className="flex-1 h-7 rounded-md border px-1.5 text-xs text-left hover:bg-accent transition-colors"
        onClick={() => { setText(value !== 'TBD' && value !== 'N/A' ? value : ''); setEditing(true); }}
      >
        {formatDisplay(value)}
      </button>
      <Input
        type="date" className="h-7 text-xs w-[130px]"
        value={value !== 'TBD' && value !== 'N/A' ? value : ''}
        onChange={e => onChange(e.target.value || 'TBD')}
      />
    </div>
  );
}

function MilestoneMiniCell({ value, dateType, pkgId, milestoneKey, updateMilestone, label }: {
  value: string; dateType: string; pkgId: string; milestoneKey: string; label: string;
  updateMilestone: (pkgId: string, mk: string, dt: string, v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = dateType === 'plannedDate'
    ? 'border-blue-400/50 text-blue-600 dark:text-blue-400'
    : dateType === 'adjustedDate'
      ? 'border-sky-300/50 text-sky-500'
      : 'border-pink-400/50 text-pink-600 dark:text-pink-400';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "rounded border px-1 py-0.5 text-[9px] cursor-pointer hover:bg-accent transition-colors flex-1 min-w-[36px]",
          color, value === 'N/A' && 'opacity-50 border-dashed',
        )}>
          {formatDisplay(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <p className="text-xs font-medium mb-2">
          {label} &mdash; {dateType === 'plannedDate' ? 'Planned' : dateType === 'adjustedDate' ? 'Forecast' : 'Actual'}
        </p>
        <div className="flex gap-1 items-center">
          <DateInput value={value} onChange={v => updateMilestone(pkgId, milestoneKey, dateType, v)} />
          <Button variant={value === 'TBD' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2"
            onClick={() => updateMilestone(pkgId, milestoneKey, dateType, 'TBD')}>TBD</Button>
          <Button variant={value === 'N/A' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2"
            onClick={() => updateMilestone(pkgId, milestoneKey, dateType, 'N/A')}>N/A</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MilestoneCell({ milestoneKey, data, pkgId, updateMilestone, activeDateType, label }: {
  milestoneKey: string; data: { plannedDate: string; adjustedDate: string; actualDate: string };
  pkgId: string; updateMilestone: (pkgId: string, mk: string, dt: string, v: string) => void;
  activeDateType: 'planned' | 'forecast' | 'actual'; label: string;
}) {
  const [open, setOpen] = useState(false);
  const dtKey = activeDateType === 'planned' ? 'plannedDate' : activeDateType === 'forecast' ? 'adjustedDate' : 'actualDate';
  const val = data[dtKey];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "w-full rounded-md border px-1.5 py-1 text-[10px] hover:bg-accent cursor-pointer transition-colors",
          val === 'N/A' ? "bg-muted/50 text-muted-foreground border-dashed" : "bg-background",
        )}>
          {formatDisplay(val)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="center">
        <p className="text-xs font-medium mb-3">{label}</p>
        {(['plannedDate', 'adjustedDate', 'actualDate'] as const).map(dt => (
          <div key={dt} className="mb-2">
            <Label className="text-[10px] text-muted-foreground mb-1 block">
              {dt === 'plannedDate' ? 'Planned' : dt === 'adjustedDate' ? 'Forecast' : 'Actual'}
            </Label>
            <div className="flex gap-1 items-center">
              <DateInput value={data[dt]} onChange={v => updateMilestone(pkgId, milestoneKey, dt, v)} />
              <Button variant={data[dt] === 'TBD' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2"
                onClick={() => updateMilestone(pkgId, milestoneKey, dt, 'TBD')}>TBD</Button>
              <Button variant={data[dt] === 'N/A' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2"
                onClick={() => updateMilestone(pkgId, milestoneKey, dt, 'N/A')}>N/A</Button>
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// --- Main Component ---

export interface ScheduleTableProps {
  groupedPackages: Record<string, EquipmentPackage[]>;
  suppliers: Supplier[];
  milestoneKeys: string[];
  milestoneLabels: Record<string, string>;
  milestoneIcons: Record<string, string>;
  visibleDateTypes: ('planned' | 'forecast' | 'actual')[];
  collapsedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  showExtraColumns: boolean;
  canEdit: boolean;
  onUpdateMilestone: (pkgId: string, msKey: string, dateType: string, value: string) => void;
  onUpdatePackageField: (pkgId: string, field: string, value: string) => void;
  onAutoGenerate?: (pkg: EquipmentPackage) => void;
  onResetDates?: (pkg: EquipmentPackage) => void;
}

export function ScheduleTable({
  groupedPackages, suppliers, milestoneKeys, milestoneLabels, milestoneIcons,
  visibleDateTypes, collapsedGroups, toggleGroup, showExtraColumns, canEdit,
  onUpdateMilestone, onUpdatePackageField, onAutoGenerate, onResetDates,
}: ScheduleTableProps) {
  const stickyBg = 'bg-white dark:bg-slate-950';
  const stickyHeaderBg = 'bg-slate-50 dark:bg-slate-900';
  const showMultiple = visibleDateTypes.length > 1;

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              {canEdit && <th className={cn("sticky left-0 z-40 min-w-[80px] px-2 py-2 border-r", stickyHeaderBg)} />}
              <th className={cn("sticky z-40 min-w-[200px] px-3 py-2.5 text-left font-semibold border-r", canEdit ? 'left-[80px]' : 'left-0', stickyHeaderBg)}>Package</th>
              {showExtraColumns && (<>
                <th className={cn("sticky left-[200px] z-40 min-w-[180px] px-3 py-2.5 text-left font-semibold border-r", stickyHeaderBg)}>Supplier</th>
                <th className={cn("sticky left-[380px] z-40 min-w-[150px] px-3 py-2.5 text-left font-semibold border-r", stickyHeaderBg)}>RFP ID</th>
                <th className={cn("sticky left-[530px] z-40 min-w-[200px] px-3 py-2.5 text-left font-semibold border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]", stickyHeaderBg)}>Comment</th>
              </>)}
              {milestoneKeys.map(key => {
                const iconName = milestoneIcons[key] || MILESTONE_ICONS_MAP[key] || 'Play';
                const Icon = ICON_LIBRARY[iconName] || Play;
                return (
                  <th key={key} className="px-1 py-2.5 text-center font-semibold border-r" style={{ minWidth: showMultiple ? visibleDateTypes.length * 60 : 100 }}>
                    <div className="flex flex-col items-center gap-1">
                      {Icon && <Icon className="h-3.5 w-3.5 text-primary/70" />}
                      <span className="text-[10px] leading-tight text-foreground/80">{milestoneLabels[key] || key}</span>
                      {showMultiple && (
                        <div className="flex gap-1 mt-0.5">
                          {visibleDateTypes.map(dt => (
                            <span key={dt} className="text-[8px] font-bold px-1 rounded-[2px]" style={{ color: 'white', backgroundColor: DATE_TYPE_COLORS[dt as keyof typeof DATE_TYPE_COLORS] }}>
                              {dt === 'planned' ? 'P' : dt === 'forecast' ? 'FOR' : 'ACT'}
                            </span>))}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedPackages).map(discipline => {
              const pkgs = groupedPackages[discipline];
              if (pkgs.length === 0) return null;
              const isCollapsed = collapsedGroups.has(discipline);
              const discColor = GANTT_COLORS[discipline] || '#64748b';

              return (
                <React.Fragment key={discipline}>
                  {/* Discipline group header */}
                  <tr className="border-b bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group"
                    onClick={() => toggleGroup(discipline)}>
                    <td className="sticky left-0 z-40 p-0 bg-slate-50 dark:bg-slate-900 border-r shadow-sm"
                      colSpan={showExtraColumns ? 4 : 1}>
                      <div className="px-3 py-2 flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: discColor }} />
                        <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">{discipline}</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-medium">{pkgs.length}</span>
                      </div>
                    </td>
                    <td colSpan={milestoneKeys.length + (canEdit ? 1 : 0)} className="bg-slate-50/50 dark:bg-slate-900/50" />
                  </tr>
                  {!isCollapsed && pkgs.map((pkg, idx) => {
                    const rowBg = idx % 2 === 0 ? stickyBg : 'bg-slate-50 dark:bg-slate-900';
                    const supplier = suppliers.find(s => s.id === pkg.awardedSupplierId);
                    return (
                      <tr key={pkg.id} className="border-b hover:bg-primary/5 transition-colors group">
                        {canEdit && (
                          <td className={cn("sticky left-0 z-30 px-1 py-1 border-r", rowBg)}>
                            <div className="flex gap-0.5">
                              {onAutoGenerate && (
                                <Button variant="outline" size="icon"
                                  className="h-6 w-6 text-primary border-primary/30 hover:bg-primary/10"
                                  title="Auto-generate schedule"
                                  onClick={() => onAutoGenerate(pkg)}>
                                  <Wand2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {onResetDates && (
                                <Button variant="outline" size="icon"
                                  className="h-6 w-6 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                                  title="Reset dates to TBD"
                                  onClick={() => onResetDates(pkg)}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="outline" size="icon"
                                className="h-6 w-6 text-destructive border-destructive/30 hover:bg-destructive/10"
                                title="Delete package"
                                onClick={() => onUpdatePackageField(pkg.id, '__delete', 'true')}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                        <td className={cn("sticky z-30 px-3 py-2 font-medium border-r", canEdit ? 'left-[80px]' : 'left-0', rowBg)}>{pkg.name}</td>
                        {showExtraColumns && (
                          <>
                            <td className={cn("sticky left-[200px] z-30 px-2 py-1.5 border-r text-[10px]", rowBg)}>
                              {supplier?.companyName || pkg.awardedSupplierName || '—'}
                            </td>
                            <td className={cn("sticky left-[380px] z-30 px-2 py-1.5 border-r text-[10px] text-muted-foreground", rowBg)}>
                              {pkg.associatedRfpId || '—'}
                            </td>
                            <td className={cn("sticky left-[530px] z-30 px-2 py-1.5 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]", rowBg)}>
                              {canEdit ? (
                                <CommentCell
                                  pkgId={pkg.id}
                                  initialValue={pkg.comment || ''}
                                  onSave={(val) => onUpdatePackageField(pkg.id, 'comment', val)}
                                />
                              ) : (
                                <span className="text-[10px] text-muted-foreground">{pkg.comment || '—'}</span>
                              )}
                            </td>
                          </>
                        )}
                        {milestoneKeys.map(key => {
                          const ms = pkg.milestones?.[key] || { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
                          return (
                            <td key={key} className="px-1 py-1 text-center">
                              {showMultiple ? (
                                <div className="flex gap-1 justify-center">
                                  {visibleDateTypes.map(dt => {
                                    const dtKey = dt === 'planned' ? 'plannedDate' : dt === 'forecast' ? 'adjustedDate' : 'actualDate';
                                    return (
                                      <MilestoneMiniCell
                                        key={dt} value={ms[dtKey as keyof typeof ms]} dateType={dtKey}
                                        pkgId={pkg.id} milestoneKey={key}
                                        updateMilestone={onUpdateMilestone} label={milestoneLabels[key]}
                                      />
                                    );
                                  })}
                                </div>
                              ) : (
                                <MilestoneCell
                                  milestoneKey={key} data={ms} pkgId={pkg.id}
                                  updateMilestone={onUpdateMilestone}
                                  activeDateType={visibleDateTypes[0]} label={milestoneLabels[key]}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
