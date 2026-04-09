import * as XLSX from 'xlsx';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, getDocs, query, where, addDoc, Timestamp } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { Schedule, SchedulePackage, Supplier, RFP } from '@/types';
import { MILESTONE_KEYS, MILESTONE_LABELS, DISCIPLINES } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import AccessDenied from '@/components/auth/access-denied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, ArrowLeft, Table2, BarChart3, Plus, Trash2, Save,
  Play, FileSearch, Gavel, Microscope, FileOutput, FileSignature, PackageCheck,
  UserCheck, PenLine, Receipt, Upload, Ruler, Factory, Truck,
  Download, UploadCloud, ZoomIn, ZoomOut, RotateCcw, Search, Filter, X, ClipboardCheck,
  ChevronDown, ChevronRight, Settings2, Flag, CheckCircle, Clock, Calendar, Star, Zap, Target,
  ArrowUp, ArrowDown, MoveUp, MoveDown, Columns,
  Ship, Plane, Box, ShoppingCart, Wallet, CreditCard, TrendingUp, AlertCircle, Info, HelpCircle, Lightbulb,
  Database, Cpu, Layers as LayersIcon, HardDrive, Eye, EyeOff
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, getWeek } from 'date-fns';
import { logAudit } from '@/lib/audit';
import { NotesButton } from '@/components/notes/notes-button';


// --- Icon map ---
const MILESTONE_ICONS_MAP: Record<string, string> = {
  projectStart: 'Play', prePurchaseSpec: 'FileSearch', biddingPeriod: 'Gavel',
  analysisPeriod: 'BarChart3', techReviewPeriod: 'Microscope', loiReleasePeriod: 'FileOutput',
  contractPeriod: 'FileSignature', procurementRecProcess: 'PackageCheck', vendorSelection: 'UserCheck',
  timeToSign: 'PenLine', poIssue: 'Receipt', submittalPeriod: 'Upload',
  shopDrawingReview: 'Ruler', production: 'Factory', delivery: 'Truck',
};

const GANTT_COLORS: Record<string, string> = {
  Mechanical: '#0ea5e9', // Sky 500
  Electrical: '#f59e0b', // Amber 500
  Civil: '#10b981',       // Emerald 500
  Others: '#8b5cf6',      // Violet 500
};

const DATE_TYPE_COLORS = {
  planned: '#3b82f6', forecast: '#93c5fd', actual: '#ec4899',
};

const ICON_LIBRARY: Record<string, any> = {
  Play, FileSearch, Gavel, Microscope, FileOutput, FileSignature, PackageCheck,
  UserCheck, PenLine, Receipt, Upload, Ruler, Factory, Truck, Flag, CheckCircle,
  Clock, Calendar, Star, Zap, Target, ClipboardCheck, Settings2,
  Ship, Plane, Box, ShoppingCart, Wallet, CreditCard, TrendingUp, AlertCircle, Info, HelpCircle, Lightbulb,
  Database, Cpu, HardDrive, Layers: LayersIcon
};

// --- Helpers ---
function emptyMilestones(keys: string[]) {
  return Object.fromEntries(keys.map(k => [k, { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' }]));
}

function parseTypedDate(raw: string): string {
  if (!raw || raw === 'TBD' || raw === 'N/A') return raw || 'TBD';
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Try MM/DD/YYYY or M/D/YYYY
  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    const y = slashMatch[3].length === 2 ? '20' + slashMatch[3] : slashMatch[3];
    return `${y}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }
  return raw;
}

function formatDisplay(val: string) {
  if (val === 'TBD' || val === 'N/A') return val;
  try { const d = new Date(val); return isNaN(d.getTime()) ? val : `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`; } catch { return val; }
}

function exportToExcel(packages: SchedulePackage[], projectName: string, milestoneKeys: string[], milestoneLabels: Record<string, string>) {
  const headers = ['Package', 'Supplier', 'Associated RFP ID', 'Comment', 'Discipline'];
  milestoneKeys.forEach(key => { 
    ['Planned', 'Forecast', 'Actual'].forEach(dt => headers.push(`${milestoneLabels[key] || key} (${dt})`)); 
  });

  const data = [headers];
  packages.forEach(pkg => {
    const row: any[] = [
      pkg.name || '', 
      pkg.awardedSupplierName || '', 
      pkg.associatedRfpId || '', 
      pkg.comment || '', 
      pkg.discipline || 'Others'
    ];
    milestoneKeys.forEach(key => { 
      const ms = pkg.milestones?.[key] || { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' }; 
      row.push(ms.plannedDate || 'TBD', ms.adjustedDate || 'TBD', ms.actualDate || 'TBD'); 
    });
    data.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

  // Adjust column widths
  const wscols = headers.map(h => ({ wch: Math.max(h.length, 15) }));
  ws['!cols'] = wscols;

  XLSX.writeFile(wb, `${projectName.replace(/\s+/g, '_')}_schedule.xlsx`);
}

interface ValidationError {
  row: number;
  column: string;
  message: string;
  value?: string;
}

// === MAIN PAGE ===
export default function ScheduleDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId!;
  const { isAdmin, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [packages, setPackages] = useState<SchedulePackage[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rfps, setRfps] = useState<RFP[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [view, setView] = useState<'table' | 'gantt'>('table');
  const [showExtraColumns, setShowExtraColumns] = useState(true);
  const [managePkgsOpen, setManagePkgsOpen] = useState(false);
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgDiscipline, setNewPkgDiscipline] = useState('Mechanical');
  const [newDiscipline, setNewDiscipline] = useState('');

  const allDisciplines = useMemo(() => {
    const defaults = Array.isArray(DISCIPLINES) ? DISCIPLINES : ['Mechanical', 'Electrical', 'Civil', 'Others'];
    const customs = schedule?.customDisciplines || [];
    return Array.from(new Set([...defaults, ...customs]));
  }, [schedule?.customDisciplines]);

  // Multi-select date filter
  const [activeDateTypes, setActiveDateTypes] = useState<Set<'planned' | 'forecast' | 'actual'>>(new Set(['planned']));

  // Milestone filter + custom milestones
  const [milestoneKeys, setMilestoneKeys] = useState<string[]>([...MILESTONE_KEYS]);
  const [milestoneLabels, setMilestoneLabels] = useState<Record<string, string>>({ ...MILESTONE_LABELS });
  const [milestoneIcons, setMilestoneIcons] = useState<Record<string, string>>({});
  const [visibleMilestones, setVisibleMilestones] = useState<Set<string>>(new Set(MILESTONE_KEYS));
  const [milestoneFilterOpen, setMilestoneFilterOpen] = useState(false);
  const [manageMilestonesOpen, setManageMilestonesOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneIcon, setNewMilestoneIcon] = useState('Play');
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<ValidationError[]>([]);
  const [importErrorsOpen, setImportErrorsOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'schedules', id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const s = { id: snap.id, ...data, createdAt: data.createdAt?.toDate?.() || new Date(), updatedAt: data.updatedAt?.toDate?.() || new Date() } as Schedule;
        setSchedule(s);
        setPackages(s.packages || []);
        setMilestoneIcons(s.milestoneIcons || {});
        
        // Discover all milestone keys from packages
        const allKeys = new Set<string>([...MILESTONE_KEYS]);
        (s.packages || []).forEach(p => Object.keys(p.milestones || {}).forEach(k => allKeys.add(k)));

        // Use custom order if exists
        const keysArr = s.milestoneOrder || Array.from(allKeys);
        setMilestoneKeys(keysArr);
        setVisibleMilestones(prev => { 
          const next = new Set(prev); 
          keysArr.forEach(k => { if (!prev.has(k) && !MILESTONE_KEYS.includes(k as any)) next.add(k); }); 
          // Ensure new keys from data are also added if not in order
          Array.from(allKeys).forEach(k => { if (!keysArr.includes(k)) keysArr.push(k); });
          return next; 
        });
        setMilestoneLabels(prev => {
          const next = { ...MILESTONE_LABELS };
          keysArr.forEach(k => { if (!next[k]) next[k] = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()); });
          return next;
        });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => { getDocs(collection(db, 'suppliers')).then(snap => { setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier))); }).catch(err => console.error('Failed to fetch suppliers:', err)); }, []);

  useEffect(() => {
    if (!schedule?.clientId) return;
    const q = query(collection(db, 'rfps'), where('clientId', '==', schedule.clientId));
    const unsub = onSnapshot(q, (snap) => {
      setRfps(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RFP)));
    });
    return () => unsub();
  }, [schedule?.clientId]);

  const saveChanges = useCallback(async (pkgs: SchedulePackage[], mOrder?: string[], mIcons?: Record<string, string>, mLabels?: Record<string, string>) => {
    setSaving(true);
    try { 
      // Deep clean of any undefined values to avoid Firestore errors
      const cleanedPackages = JSON.parse(JSON.stringify(pkgs, (k, v) => v === undefined ? null : v));
      const updates: any = { packages: cleanedPackages, updatedAt: serverTimestamp() };
      if (mOrder) updates.milestoneOrder = mOrder;
      if (mIcons) updates.milestoneIcons = mIcons;
      if (mLabels) updates.milestoneLabels = mLabels;
      await updateDoc(doc(db, 'schedules', id), updates);
      logAudit({ action: 'schedule.updated', category: 'schedule', targetCollection: 'schedules', targetDocId: id, details: { updateType: 'packages' } });
      setHasChanges(false);
      toast({ title: 'Saved' }); 
    } catch (e: any) { 
      toast({ variant: 'destructive', title: 'Error', description: e.message }); 
    } finally { 
      setSaving(false); 
    }
  }, [id, toast]);

  const updatePackageField = (pkgId: string, field: string, value: any) => { setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, [field]: value } : p)); setHasChanges(true); };
  const updateMilestone = (pkgId: string, mk: string, dt: string, value: string) => {
    setPackages(prev => prev.map(p => p.id !== pkgId ? p : { ...p, milestones: { ...p.milestones, [mk]: { ...p.milestones[mk], [dt]: value } } }));
    setHasChanges(true);
  };

  const addPackage = () => {
    if (!newPkgName.trim()) return;
    setPackages(prev => [...prev, { id: crypto.randomUUID(), name: newPkgName.trim(), discipline: newPkgDiscipline as any, milestones: emptyMilestones(milestoneKeys) }]);
    setHasChanges(true); setNewPkgName('');
  };
  const deletePackage = (pkgId: string) => { setPackages(prev => prev.filter(p => p.id !== pkgId)); setHasChanges(true); };

  const addMilestone = () => {
    if (!newMilestoneName.trim()) return;
    const key = newMilestoneName.trim().replace(/\s+/g, '').replace(/^(.)/, (_, c) => c.toLowerCase());
    if (milestoneKeys.includes(key)) { toast({ variant: 'destructive', title: 'Milestone already exists' }); return; }
    
    const nextKeys = [...milestoneKeys, key];
    const nextIcons = { ...milestoneIcons, [key]: newMilestoneIcon };
    const nextLabels = { ...milestoneLabels, [key]: newMilestoneName.trim() };
    
    setMilestoneKeys(nextKeys);
    setMilestoneLabels(nextLabels);
    setMilestoneIcons(nextIcons);
    setVisibleMilestones(prev => new Set([...prev, key]));
    
    // Add empty milestone data to all packages
    const nextPackages = packages.map(p => ({ ...p, milestones: { ...p.milestones, [key]: { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' } } }));
    setPackages(nextPackages);
    
    // Persist immediately since it affects all packages
    saveChanges(nextPackages, nextKeys, nextIcons, nextLabels);
    
    setNewMilestoneName(''); 
    setAddMilestoneOpen(false);
  };

  const deleteMilestone = (key: string) => {
    setMilestoneKeys(prev => prev.filter(k => k !== key));
    setVisibleMilestones(prev => { const n = new Set(prev); n.delete(key); return n; });
    setPackages(prev => prev.map(p => { const m = { ...p.milestones }; delete m[key]; return { ...p, milestones: m }; }));
    setHasChanges(true);
  };

  const addCustomDiscipline = async () => {
    if (!newDiscipline.trim() || !schedule) return;
    const name = newDiscipline.trim();
    if (allDisciplines.includes(name)) { toast({ variant: 'destructive', title: 'Discipline already exists' }); return; }
    try {
      await updateDoc(doc(db, 'schedules', id), { customDisciplines: [...(schedule.customDisciplines || []), name], updatedAt: serverTimestamp() });
      logAudit({ action: 'schedule.discipline_added', category: 'schedule', targetCollection: 'schedules', targetDocId: id, details: { discipline: newDiscipline } });
      setNewDiscipline('');
      toast({ title: 'Discipline added' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
  };

  const toggleDateType = (dt: 'planned' | 'forecast' | 'actual') => {
    setActiveDateTypes(prev => { const n = new Set(prev); if (n.has(dt)) { if (n.size > 1) n.delete(dt); } else n.add(dt); return n; });
  };

  const processImportRows = useCallback((rows: string[][]) => {
    if (rows.length < 2) throw new Error('File is empty or has no data rows.');

    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const headers = rows[0].map(h => (h || '').trim());

    // --- Step 1: Header-based column matching ---
    const REQUIRED_COLUMNS = ['Package'];
    const META_COLUMNS: Record<string, string> = {
      'Package': 'name',
      'Supplier': 'awardedSupplierName',
      'Associated RFP ID': 'associatedRfpId',
      'Comment': 'comment',
      'Discipline': 'discipline',
    };

    // Find meta column indices by header name (case-insensitive)
    const colMap: Record<string, number> = {};
    for (const [headerName] of Object.entries(META_COLUMNS)) {
      const idx = headers.findIndex(h => h.toLowerCase() === headerName.toLowerCase());
      if (idx !== -1) colMap[headerName] = idx;
    }

    // Check required columns exist
    for (const req of REQUIRED_COLUMNS) {
      if (colMap[req] === undefined) {
        errors.push({ row: 1, column: req, message: `Required column "${req}" not found in headers. Found: ${headers.join(', ')}` });
      }
    }
    if (errors.length > 0) return { imported: [], errors, warnings, stats: { added: 0, updated: 0, unchanged: 0 } };

    // Find milestone columns by matching "(Planned)", "(Forecast)", "(Actual)" suffix
    const milestoneColMap: Record<string, { planned?: number; forecast?: number; actual?: number }> = {};
    headers.forEach((h, idx) => {
      const plannedMatch = h.match(/^(.+?)\s*\(Planned\)$/i);
      const forecastMatch = h.match(/^(.+?)\s*\(Forecast\)$/i);
      const actualMatch = h.match(/^(.+?)\s*\(Actual\)$/i);
      if (plannedMatch) {
        const label = plannedMatch[1].trim();
        if (!milestoneColMap[label]) milestoneColMap[label] = {};
        milestoneColMap[label].planned = idx;
      } else if (forecastMatch) {
        const label = forecastMatch[1].trim();
        if (!milestoneColMap[label]) milestoneColMap[label] = {};
        milestoneColMap[label].forecast = idx;
      } else if (actualMatch) {
        const label = actualMatch[1].trim();
        if (!milestoneColMap[label]) milestoneColMap[label] = {};
        milestoneColMap[label].actual = idx;
      }
    });

    // Map milestone labels back to keys
    const labelToKey: Record<string, string> = {};
    for (const key of milestoneKeys) {
      const label = milestoneLabels[key] || key;
      labelToKey[label.toLowerCase()] = key;
    }

    // Warn about unrecognized milestone columns
    for (const label of Object.keys(milestoneColMap)) {
      if (!labelToKey[label.toLowerCase()]) {
        warnings.push({ row: 1, column: label, message: `Unknown milestone "${label}" — will be added as a new milestone.` });
      }
    }

    // Warn about extra columns that aren't meta or milestone
    const knownIndices = new Set([
      ...Object.values(colMap),
      ...Object.values(milestoneColMap).flatMap(m => [m.planned, m.forecast, m.actual].filter((v): v is number => v !== undefined)),
    ]);
    headers.forEach((h, idx) => {
      if (h && !knownIndices.has(idx)) {
        warnings.push({ row: 1, column: h, message: `Column "${h}" not recognized — will be ignored.` });
      }
    });

    // --- Step 2: Parse rows ---
    const imported: SchedulePackage[] = [];
    const seenNames = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.every(c => !c?.trim())) continue;
      const rowNum = i + 1;

      const pkgName = (cols[colMap['Package']] || '').trim();
      if (!pkgName) {
        errors.push({ row: rowNum, column: 'Package', message: 'Package Name is required.' });
        continue;
      }

      // Duplicate detection
      if (seenNames.has(pkgName.toLowerCase())) {
        errors.push({ row: rowNum, column: 'Package', message: `Duplicate package name "${pkgName}" — each package must have a unique name.` });
        continue;
      }
      seenNames.add(pkgName.toLowerCase());

      // Parse discipline with warning for unknown
      const rawDisc = colMap['Discipline'] !== undefined ? (cols[colMap['Discipline']] || '').trim() : '';
      let discipline = rawDisc || 'Others';
      if (rawDisc && !allDisciplines.includes(rawDisc)) {
        warnings.push({ row: rowNum, column: 'Discipline', message: `Unknown discipline "${rawDisc}" — mapped to "Others".`, value: rawDisc });
        discipline = 'Others';
      }

      // Parse milestone dates
      const ms: Record<string, any> = {};
      for (const [label, colIndices] of Object.entries(milestoneColMap)) {
        const key = labelToKey[label.toLowerCase()] || label.replace(/\s+/g, '').replace(/^(.)/, (m) => m.toLowerCase());
        const milestoneData: Record<string, string> = {};

        const dateTypes = [
          { field: 'plannedDate', colIdx: colIndices.planned, label: 'Planned' },
          { field: 'adjustedDate', colIdx: colIndices.forecast, label: 'Forecast' },
          { field: 'actualDate', colIdx: colIndices.actual, label: 'Actual' },
        ];

        for (const dt of dateTypes) {
          const rawVal = dt.colIdx !== undefined ? (cols[dt.colIdx] || '').trim() : '';
          const parsed = parseTypedDate(rawVal);
          if (parsed !== 'TBD' && parsed !== 'N/A' && parsed && !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
            errors.push({
              row: rowNum,
              column: `${label} (${dt.label})`,
              message: 'Invalid date format. Use MM/DD/YYYY or YYYY-MM-DD.',
              value: rawVal,
            });
          }
          milestoneData[dt.field] = parsed || 'TBD';
        }
        ms[key] = milestoneData;
      }

      // Fill missing milestones with TBD
      for (const key of milestoneKeys) {
        if (!ms[key]) ms[key] = { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
      }

      imported.push({
        id: crypto.randomUUID(),
        name: pkgName,
        awardedSupplierName: colMap['Supplier'] !== undefined ? (cols[colMap['Supplier']] || '').trim() || undefined : undefined,
        associatedRfpId: colMap['Associated RFP ID'] !== undefined ? (cols[colMap['Associated RFP ID']] || '').trim() || undefined : undefined,
        comment: colMap['Comment'] !== undefined ? (cols[colMap['Comment']] || '').trim() || undefined : undefined,
        discipline: discipline as any,
        milestones: ms,
      });
    }

    // --- Step 3: Merge with existing packages ---
    const existingByName = new Map(packages.map(p => [p.name.toLowerCase(), p]));
    const merged: SchedulePackage[] = [];
    let added = 0, updated = 0, unchanged = 0;

    for (const imp of imported) {
      const existing = existingByName.get(imp.name.toLowerCase());
      if (existing) {
        // Update existing package — keep ID, merge milestone data
        merged.push({
          ...existing,
          awardedSupplierName: imp.awardedSupplierName || existing.awardedSupplierName,
          associatedRfpId: imp.associatedRfpId || existing.associatedRfpId,
          comment: imp.comment || existing.comment,
          discipline: imp.discipline || existing.discipline,
          milestones: { ...existing.milestones, ...imp.milestones },
        });
        existingByName.delete(imp.name.toLowerCase());
        updated++;
      } else {
        // New package
        merged.push(imp);
        added++;
      }
    }

    // Keep existing packages not in the import
    for (const remaining of existingByName.values()) {
      merged.push(remaining);
      unchanged++;
    }

    return { imported: merged, errors, warnings, stats: { added, updated, unchanged } };
  }, [milestoneKeys, milestoneLabels, allDisciplines, packages]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isExcel = ext === 'xlsx' || ext === 'xls';

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let rows: string[][];

        if (isExcel) {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
          rows = raw.map(r => r.map(c => (c != null ? String(c).trim() : '')));
        } else {
          // Fallback to CSV if needed, though user requested Excel
          const text = ev.target?.result as string;
          const lines = text.trim().split(/\r?\n/);
          rows = lines.map(line => {
            const result: string[] = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') inQuotes = !inQuotes;
              else if (char === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
              else cur += char;
            }
            result.push(cur.trim());
            return result.map(v => v.replace(/^"|"$/g, '').trim());
          });
        }

        const { imported, errors, warnings, stats } = processImportRows(rows);

        if (errors.length > 0) {
          setImportErrors(errors);
          setImportErrorsOpen(true);
          toast({
            variant: 'destructive',
            title: 'Import Validation Failed',
            description: `Found ${errors.length} error(s) in the file. Please review and fix them.`
          });
          return;
        }

        if (imported.length) {
          setPackages(imported);
          setHasChanges(true);
          const parts = [];
          if (stats.added > 0) parts.push(`${stats.added} added`);
          if (stats.updated > 0) parts.push(`${stats.updated} updated`);
          if (stats.unchanged > 0) parts.push(`${stats.unchanged} unchanged`);
          toast({ title: 'Import Successful', description: parts.join(', ') + '.' });
          if (warnings.length > 0) {
            setImportErrors(warnings);
            setImportErrorsOpen(true);
          }
        }
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Import Error',
          description: err.message || 'Failed to parse file.'
        });
      }
    };
    reader.onerror = () => toast({ variant: 'destructive', title: 'Error', description: 'Failed to read file.' });
    if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredPackages = useMemo(() => {
    return packages.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.awardedSupplierName && p.awardedSupplierName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [packages, searchTerm]);

  const groupedPackages = useMemo(() => {
    const groups: Record<string, SchedulePackage[]> = {
      'Mechanical': [], 'Electrical': [], 'Civil': [], 'Others': []
    };
    filteredPackages.forEach(p => {
      const g = DISCIPLINES.includes(p.discipline as any) ? p.discipline : 'Others';
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });
    return groups;
  }, [filteredPackages]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const n = new Set(prev);
      if (n.has(group)) n.delete(group);
      else n.add(group);
      return n;
    });
  };

  const filteredMilestoneKeys = useMemo(() => milestoneKeys.filter(k => visibleMilestones.has(k)), [milestoneKeys, visibleMilestones]);
  const visibleDateTypesArr = useMemo(() => {
    const order = ['planned', 'forecast', 'actual'];
    return Array.from(activeDateTypes).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [activeDateTypes]);

  if (authLoading || loading) return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <AccessDenied inline />;
  if (!schedule) return <div className="flex h-full w-full items-center justify-center"><p>Schedule not found.</p></div>;

  return (
    <div className="container mx-auto py-2 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/schedules"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div><h1 className="text-xl font-semibold tracking-tight">{schedule.projectName}</h1><p className="text-xs text-muted-foreground">{schedule.clientName}</p></div>
          <NotesButton entityType="project" entityId={id} entityName={schedule?.projectName || 'Schedule'} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date type toggles (multi-select) */}
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
            {(['planned', 'forecast', 'actual'] as const).map(dt => (
              <Button key={dt} variant={activeDateTypes.has(dt) ? 'default' : 'ghost'} size="sm" className="h-7 text-xs capitalize" onClick={() => toggleDateType(dt)}>
                <div className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: DATE_TYPE_COLORS[dt] }} />{dt}
              </Button>
            ))}
          </div>

          {/* Milestone filter */}
          <Popover open={milestoneFilterOpen} onOpenChange={setMilestoneFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Filter className="mr-1.5 h-3.5 w-3.5" /> Milestones {visibleMilestones.size < milestoneKeys.length && `(${visibleMilestones.size}/${milestoneKeys.length})`}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <div className="p-2 border-b flex justify-between items-center">
                <span className="text-xs font-medium">Show/Hide Milestones</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setVisibleMilestones(new Set(milestoneKeys))}>All</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setVisibleMilestones(new Set())}>None</Button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                {milestoneKeys.map(key => {
                  const isDefault = (MILESTONE_KEYS as readonly string[]).includes(key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 py-0.5">
                      <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
                        <Checkbox checked={visibleMilestones.has(key)} onCheckedChange={() => {
                          setVisibleMilestones(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                        }} />
                        {milestoneLabels[key] || key}
                      </label>
                      {!isDefault && (
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => deleteMilestone(key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-2 border-t">
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setMilestoneFilterOpen(false); setAddMilestoneOpen(true); }}>
                  <Plus className="mr-1.5 h-3 w-3" /> Add Milestone
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
            <Button variant={view === 'table' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => setView('table')}><Table2 className="mr-1.5 h-3.5 w-3.5" /> Table</Button>
            <Button variant={view === 'gantt' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => setView('gantt')}><BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Gantt</Button>
          </div>

          <Link to="/dashboard/schedules/summary">
            <Button variant="outline" size="sm">
              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Summary
            </Button>
          </Link>

          {view === 'table' && (
            <Button 
              variant="outline" 
              size="sm" 
              className={cn("h-8 gap-2 px-3", !showExtraColumns && "bg-primary/10 border-primary/20 text-primary")}
              onClick={() => setShowExtraColumns(!showExtraColumns)}
            >
              {showExtraColumns ? <Columns className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
              {showExtraColumns ? 'Compact View' : 'Show Details'}
            </Button>
          )}

          <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-background focus-within:ring-1 focus-within:ring-primary h-8 max-w-[200px]">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input 
              className="bg-transparent border-none outline-none text-xs w-full"
              placeholder="Search packages..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && <X className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => setSearchTerm('')} />}
          </div>

          {/* Export/Import */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Excel</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToExcel(packages, schedule.projectName, filteredMilestoneKeys, milestoneLabels)}><Download className="mr-2 h-4 w-4" /> Export (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" /> Import (.xlsx)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />

          <Button variant="outline" size="sm" onClick={() => setManageMilestonesOpen(true)}>
             <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Milestones
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManagePkgsOpen(true)}><Settings2 className="mr-1.5 h-3.5 w-3.5" /> Packages</Button>
          {hasChanges && <Button size="sm" onClick={() => saveChanges(packages)} disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save</Button>}
        </div>
      </div>

      {/* View */}
      {view === 'table' ? (
        <ScheduleTable 
          groupedPackages={groupedPackages} 
          suppliers={suppliers} 
          rfps={rfps}
          clientId={schedule.clientId}
          updatePackageField={updatePackageField} 
          updateMilestone={updateMilestone} 
          deletePackage={deletePackage} 
          milestoneKeys={filteredMilestoneKeys} 
          milestoneLabels={milestoneLabels} 
          visibleDateTypes={visibleDateTypesArr as any}
          collapsedGroups={collapsedGroups}
          toggleGroup={toggleGroup}
          showExtraColumns={showExtraColumns}
          milestoneIcons={milestoneIcons}
        />
      ) : (
        <GanttChart 
          groupedPackages={groupedPackages} 
          milestoneKeys={filteredMilestoneKeys} 
          milestoneLabels={milestoneLabels} 
          milestoneIcons={milestoneIcons}
          visibleDateTypes={visibleDateTypesArr as any}
          collapsedGroups={collapsedGroups}
          toggleGroup={toggleGroup}
          packagesCount={filteredPackages.length}
        />
      )}

      {/* Spacer */}
      <div className="h-4" />

      {/* Manage Packages Dialog */}
      <Dialog open={managePkgsOpen} onOpenChange={setManagePkgsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Manage Packages</DialogTitle><DialogDescription>Add or remove packages from your schedule.</DialogDescription></DialogHeader>
          
          <div className="space-y-6 pt-4">
            {/* Existing Packages List */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium border-b pb-2">Current Packages ({packages.length})</h3>
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                {packages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No packages yet. Add one below.</p>
                ) : packages.map(pkg => (
                  <div key={pkg.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 group hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: GANTT_COLORS[pkg.discipline] || '#64748b' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{pkg.name}</p>
                        <Select value={pkg.discipline} onValueChange={(val) => updatePackageField(pkg.id, 'discipline', val)}>
                          <SelectTrigger className="h-6 w-fit min-w-[100px] text-[9px] uppercase tracking-wider p-1 mt-0.5 bg-transparent border-none hover:bg-muted focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allDisciplines.map(d => <SelectItem key={d} value={d} className="text-[10px]">{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors shrink-0" onClick={() => deletePackage(pkg.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Package Form */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Add New Package</h3>
                <div className="flex items-center gap-2">
                  <Input placeholder="New Discipline..." className="h-7 text-[10px] w-32" value={newDiscipline} onChange={e => setNewDiscipline(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomDiscipline()} />
                  <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={addCustomDiscipline} disabled={!newDiscipline.trim()}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Package Name</Label><Input placeholder="e.g., Cooling Towers" value={newPkgName} onChange={e => setNewPkgName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPackage()} /></div>
                <div className="space-y-2"><Label>Discipline</Label>
                  <Select value={newPkgDiscipline} onValueChange={setNewPkgDiscipline}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allDisciplines.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={addPackage} disabled={!newPkgName.trim()}><Plus className="mr-2 h-4 w-4" /> Add to Schedule</Button>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="default" className="w-full sm:w-auto" onClick={() => setManagePkgsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Milestone Dialog */}
      <Dialog open={addMilestoneOpen} onOpenChange={setAddMilestoneOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Milestone</DialogTitle><DialogDescription>Create a new milestone column for all packages.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Milestone Name</Label><Input placeholder="e.g., Quality Inspection" value={newMilestoneName} onChange={e => setNewMilestoneName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Select Icon</Label>
              <IconPicker value={newMilestoneIcon} onChange={setNewMilestoneIcon} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddMilestoneOpen(false)}>Cancel</Button><Button onClick={addMilestone} disabled={!newMilestoneName.trim()}>Add Milestone</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Milestones Dialog */}
      <ManageMilestonesDialog 
        open={manageMilestonesOpen} 
        onOpenChange={setManageMilestonesOpen} 
        milestoneKeys={milestoneKeys} 
        milestoneLabels={milestoneLabels}
        milestoneIcons={milestoneIcons}
        onSave={(newOrder, newLabels, newIcons) => {
          setMilestoneKeys(newOrder);
          setMilestoneLabels(newLabels);
          setMilestoneIcons(newIcons);
          saveChanges(packages, newOrder, newIcons, newLabels);
        }}
        onDelete={deleteMilestone}
      />

      {/* Import Errors Dialog */}
      <Dialog open={importErrorsOpen} onOpenChange={setImportErrorsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <DialogTitle>Import Validation Errors</DialogTitle>
            </div>
            <DialogDescription>
              We found some issues in your file. Please fix these in your Excel sheet and try uploading again.
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
            <Button onClick={() => setImportErrorsOpen(false)}>Close & Revise File</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === ICON PICKER ===
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2 border rounded-lg p-2 max-h-48 overflow-y-auto bg-muted/20">
      {Object.entries(ICON_LIBRARY).map(([name, Icon]) => (
        <Button 
          key={name}
          variant={value === name ? 'default' : 'ghost'} 
          size="icon" 
          className="h-8 w-8" 
          onClick={() => onChange(name)}
          title={name}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}

// === MANAGE MILESTONES DIALOG ===
function ManageMilestonesDialog({ open, onOpenChange, milestoneKeys, milestoneLabels, milestoneIcons, onSave, onDelete }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  milestoneKeys: string[]; milestoneLabels: Record<string, string>;
  milestoneIcons: Record<string, string>;
  onSave: (order: string[], labels: Record<string, string>, icons: Record<string, string>) => void;
  onDelete: (key: string) => void;
}) {
  const [localKeys, setLocalKeys] = useState([...milestoneKeys]);
  const [localLabels, setLocalLabels] = useState({ ...milestoneLabels });
  const [localIcons, setLocalIcons] = useState({ ...milestoneIcons });

  useEffect(() => {
    if (open) {
      setLocalKeys([...milestoneKeys]);
      setLocalLabels({ ...milestoneLabels });
      setLocalIcons({ ...milestoneIcons });
    }
  }, [open, milestoneKeys, milestoneLabels, milestoneIcons]);

  const move = (index: number, direction: 'up' | 'down') => {
    const nextKeys = [...localKeys];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextKeys.length) return;
    const [removed] = nextKeys.splice(index, 1);
    nextKeys.splice(targetIndex, 0, removed);
    setLocalKeys(nextKeys);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Manage Milestones & Sequence</DialogTitle><DialogDescription>Reorder milestones and customize icons/labels.</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2 py-4">
          {localKeys.map((key, idx) => {
            const iconName = localIcons[key] || MILESTONE_ICONS_MAP[key] || 'Play';
            const Icon = ICON_LIBRARY[iconName] || Play;
            const isDefault = (MILESTONE_KEYS as readonly string[]).includes(key);
            
            return (
              <div key={key} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30 group">
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 'up')} disabled={idx === 0}><MoveUp className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 'down')} disabled={idx === localKeys.length - 1}><MoveDown className="h-3 w-3" /></Button>
                </div>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><Icon className="h-5 w-5" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2"><IconPicker value={localIcons[key] || 'Play'} onChange={(v) => setLocalIcons(prev => ({ ...prev, [key]: v }))} /></PopoverContent>
                </Popover>

                <div className="flex-1 space-y-1">
                  <Input 
                    value={localLabels[key] || ''} 
                    onChange={e => setLocalLabels(prev => ({ ...prev, [key]: e.target.value }))}
                    className="h-8 text-xs font-semibold"
                  />
                  <p className="text-[10px] text-muted-foreground ml-1">{key}</p>
                </div>

                {!isDefault && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="border-t pt-4">
           <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
           <Button onClick={() => { onSave(localKeys, localLabels, localIcons); onOpenChange(false); }}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === SUPPLIER SEARCH SELECTOR ===
function SupplierSelector({ suppliers, value, onChange }: { suppliers: Supplier[]; value: string; onChange: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = suppliers.find(s => s.id === value);
  const filtered = suppliers.filter(s => s.companyName.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 h-7 w-full rounded-md border border-input bg-background px-2 text-xs hover:bg-accent transition-colors text-left">
          {selected?.logoUrl && <img src={selected.logoUrl} alt="" className="h-4 w-4 rounded-sm object-cover shrink-0" />}
          <span className="truncate flex-1">{selected?.companyName || <span className="text-muted-foreground">Select...</span>}</span>
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <Input placeholder="Search suppliers..." className="h-7 text-xs" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="max-h-48 overflow-y-auto">
          <button className={cn("flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left", !value && "bg-accent")} onClick={() => { onChange('', ''); setOpen(false); setSearch(''); }}>
            <div className="h-5 w-5 rounded-sm bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0"><X className="h-3 w-3" /></div>
            <span className="italic text-muted-foreground">None / Open</span>
          </button>
          {filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">No suppliers found.</p>
          ) : filtered.map(s => (
            <button key={s.id} className={cn("flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left", s.id === value && "bg-accent")} onClick={() => { onChange(s.id, s.companyName); setOpen(false); setSearch(''); }}>
              {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" /> : <div className="h-5 w-5 rounded-sm bg-muted flex items-center justify-center text-[8px] font-bold shrink-0">{s.companyName.charAt(0)}</div>}
              <span className="truncate">{s.companyName}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// === DATE INPUT (typeable + calendar) ===
function DateInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (editing) {
    return (
      <Input className={cn("h-7 text-xs", className)} value={text} autoFocus placeholder="MM/DD/YYYY"
        onChange={e => setText(e.target.value)}
        onBlur={() => { const parsed = parseTypedDate(text); onChange(parsed); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { const parsed = parseTypedDate(text); onChange(parsed); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <div className="flex gap-0.5 flex-1">
      <button className={cn("flex-1 h-7 rounded-md border px-1.5 text-xs text-left hover:bg-accent transition-colors", className)} onClick={() => { setText(value !== 'TBD' && value !== 'N/A' ? value : ''); setEditing(true); }}>
        {formatDisplay(value)}
      </button>
      <input type="date" className="h-7 w-7 opacity-0 absolute" style={{ pointerEvents: 'none' }} />
      <Input type="date" className="h-7 text-xs w-[130px]" value={value !== 'TBD' && value !== 'N/A' ? value : ''} onChange={e => onChange(e.target.value || 'TBD')} />
    </div>
  );
}

// === SCHEDULE TABLE ===
function ScheduleTable({ 
  groupedPackages, suppliers, rfps, clientId, updatePackageField, updateMilestone, 
  deletePackage, milestoneKeys, milestoneLabels, milestoneIcons, visibleDateTypes, 
  collapsedGroups, toggleGroup, showExtraColumns 
}: {
  groupedPackages: Record<string, SchedulePackage[]>; suppliers: Supplier[]; rfps: RFP[]; clientId: string;
  updatePackageField: (pkgId: string, field: string, value: any) => void;
  updateMilestone: (pkgId: string, mk: string, dt: string, v: string) => void;
  deletePackage: (pkgId: string) => void;
  milestoneKeys: string[]; milestoneLabels: Record<string, string>;
  milestoneIcons: Record<string, string>;
  visibleDateTypes: ('planned' | 'forecast' | 'actual')[];
  collapsedGroups: Set<string>; toggleGroup: (g: string) => void;
  showExtraColumns: boolean;
}) {
  const stickyBg = 'bg-white dark:bg-slate-950';
  const stickyHeaderBg = 'bg-slate-50 dark:bg-slate-900';
  const showMultiple = visibleDateTypes.length > 1;

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className={cn("sticky left-0 z-40 min-w-[200px] px-3 py-2.5 text-left font-semibold border-r", stickyHeaderBg)}>Package</th>
              {showExtraColumns && (
                <>
                  <th className={cn("sticky left-[200px] z-40 min-w-[180px] px-3 py-2.5 text-left font-semibold border-r", stickyHeaderBg)}>Supplier</th>
                  <th className={cn("sticky left-[380px] z-40 min-w-[150px] px-3 py-2.5 text-left font-semibold border-r", stickyHeaderBg)}>Associated RFP</th>
                  <th className={cn("sticky left-[530px] z-40 min-w-[200px] px-3 py-2.5 text-left font-semibold border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]", stickyHeaderBg)}>Comment</th>
                </>
              )}
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
                            <span 
                              key={dt} 
                              className="text-[8px] font-bold px-1 rounded-[2px]" 
                              style={{ color: 'white', backgroundColor: DATE_TYPE_COLORS[dt as keyof typeof DATE_TYPE_COLORS] }}
                            >
                              {dt === 'planned' ? 'P' : dt === 'forecast' ? 'FOR' : 'ACT'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
              <th className="min-w-[40px] px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(groupedPackages) as (keyof typeof groupedPackages)[]).map(discipline => {
              const pkgs = groupedPackages[discipline];
              if (pkgs.length === 0) return null;
              const isCollapsed = collapsedGroups.has(discipline);
              const discColor = GANTT_COLORS[discipline] || '#64748b';

              return (
                <React.Fragment key={discipline}>
                  {/* Group Header */}
                  <tr className="border-b bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group" onClick={() => toggleGroup(discipline)}>
                    {/* Sticky Label Part */}
                    <td className="sticky left-0 z-40 p-0 bg-slate-50 dark:bg-slate-900 border-r shadow-sm" colSpan={showExtraColumns ? 4 : 1}>
                      <div className="px-3 py-2 flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: discColor }} />
                        <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">{discipline}</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-medium">{pkgs.length}</span>
                      </div>
                    </td>
                    {/* Non-sticky Filler Part */}
                    <td colSpan={milestoneKeys.length + 1} className="bg-slate-50/50 dark:bg-slate-900/50"></td>
                  </tr>

                  {/* Rows */}
                  {!isCollapsed && pkgs.map((pkg, idx) => {
                    const rowBg = idx % 2 === 0 ? stickyBg : 'bg-slate-50 dark:bg-slate-900';
                    return (
                      <tr key={pkg.id} className="border-b hover:bg-primary/5 transition-colors group">
                        <td className={cn("sticky left-0 z-30 px-3 py-2 font-medium border-r", rowBg)}>{pkg.name}</td>
                        {showExtraColumns && (
                          <>
                            <td className={cn("sticky left-[200px] z-30 px-2 py-1.5 border-r", rowBg)}>
                              <SupplierSelector suppliers={suppliers} value={pkg.awardedSupplierId || ''} onChange={(id, name) => { updatePackageField(pkg.id, 'awardedSupplierId', id); updatePackageField(pkg.id, 'awardedSupplierName', name); }} />
                            </td>
                            <td className={cn("sticky left-[380px] z-30 px-2 py-1.5 border-r", rowBg)}>
                              <RfpSelector rfps={rfps} clientId={clientId} value={pkg.associatedRfpId || ''} onChange={(rfpId: string) => updatePackageField(pkg.id, 'associatedRfpId', rfpId)} />
                            </td>
                            <td className={cn("sticky left-[530px] z-30 px-2 py-1.5 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]", rowBg)}>
                              <textarea 
                                className="w-full min-h-[28px] max-h-[100px] text-[10px] bg-transparent border-none focus:ring-1 focus:ring-primary rounded p-1 resize-y"
                                placeholder="Add comment..."
                                value={pkg.comment || ''}
                                onChange={(e) => updatePackageField(pkg.id, 'comment', e.target.value)}
                              />
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
                                    return <MilestoneMiniCell key={dt} value={(ms as any)[dtKey]} dateType={dtKey} pkgId={pkg.id} milestoneKey={key} updateMilestone={updateMilestone} label={milestoneLabels[key]} />;
                                  })}
                                </div>
                              ) : (
                                <MilestoneCell milestoneKey={key} data={ms} pkgId={pkg.id} updateMilestone={updateMilestone} activeDateType={visibleDateTypes[0]} label={milestoneLabels[key]} />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2"><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => deletePackage(pkg.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
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

// === MINI CELL ===
function MilestoneMiniCell({ value, dateType, pkgId, milestoneKey, updateMilestone, label }: {
  value: string; dateType: string; pkgId: string; milestoneKey: string; label: string;
  updateMilestone: (pkgId: string, mk: string, dt: string, v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = dateType === 'plannedDate' ? 'border-blue-400/50 text-blue-700' : dateType === 'adjustedDate' ? 'border-sky-300/50 text-sky-500' : 'border-pink-400/50 text-pink-600';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("rounded border px-1 py-0.5 text-[9px] cursor-pointer hover:bg-accent transition-colors flex-1 min-w-[36px]", color, value === 'N/A' && 'opacity-50 border-dashed')}>{formatDisplay(value)}</button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <p className="text-xs font-medium mb-2">{label} — {dateType === 'plannedDate' ? 'Planned' : dateType === 'adjustedDate' ? 'Forecast' : 'Actual'}</p>
        <div className="flex gap-1 items-center">
          <DateInput value={value} onChange={v => updateMilestone(pkgId, milestoneKey, dateType, v)} />
          <Button variant={value === 'TBD' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2" onClick={() => updateMilestone(pkgId, milestoneKey, dateType, 'TBD')}>TBD</Button>
          <Button variant={value === 'N/A' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2" onClick={() => updateMilestone(pkgId, milestoneKey, dateType, 'N/A')}>N/A</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// === SINGLE MILESTONE CELL ===
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
        <button className={cn("w-full rounded-md border px-1.5 py-1 text-[10px] hover:bg-accent cursor-pointer transition-colors", val === 'N/A' ? "bg-muted/50 text-muted-foreground border-dashed" : "bg-background")}>{formatDisplay(val)}</button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="center">
        <p className="text-xs font-medium mb-3">{label}</p>
        {(['plannedDate', 'adjustedDate', 'actualDate'] as const).map(dt => (
          <div key={dt} className="mb-2">
            <Label className="text-[10px] text-muted-foreground mb-1 block">{dt === 'plannedDate' ? 'Planned' : dt === 'adjustedDate' ? 'Forecast' : 'Actual'}</Label>
            <div className="flex gap-1 items-center">
              <DateInput value={data[dt]} onChange={v => updateMilestone(pkgId, milestoneKey, dt, v)} />
              <Button variant={data[dt] === 'TBD' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2" onClick={() => updateMilestone(pkgId, milestoneKey, dt, 'TBD')}>TBD</Button>
              <Button variant={data[dt] === 'N/A' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] px-2" onClick={() => updateMilestone(pkgId, milestoneKey, dt, 'N/A')}>N/A</Button>
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// === GANTT CHART ===
function GanttChart({ groupedPackages, milestoneKeys, milestoneLabels, milestoneIcons, visibleDateTypes, collapsedGroups, toggleGroup, packagesCount }: {
  groupedPackages: Record<string, SchedulePackage[]>; milestoneKeys: string[];
  milestoneLabels: Record<string, string>; milestoneIcons: Record<string, string>; 
  visibleDateTypes: ('planned' | 'forecast' | 'actual')[];
  collapsedGroups: Set<string>; toggleGroup: (g: string) => void; packagesCount: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [showLegend, setShowLegend] = useState(true);

  const flatPackages = useMemo(() => {
    const list: (SchedulePackage | { type: 'header'; label: string })[] = [];
    Object.entries(groupedPackages).forEach(([disc, pkgs]) => {
      if (pkgs.length === 0) return;
      list.push({ type: 'header', label: disc } as any);
      if (!collapsedGroups.has(disc)) {
        pkgs.forEach(p => list.push(p));
      }
    });
    return list;
  }, [groupedPackages, collapsedGroups]);

  const allDates: Date[] = [];
  Object.values(groupedPackages).flat().forEach(pkg => { 
    Object.values(pkg.milestones || {}).forEach(ms => { 
      for (const val of [ms.plannedDate, ms.adjustedDate, ms.actualDate]) { 
        if (val && val !== 'TBD' && val !== 'N/A') { 
          const d = new Date(val); if (!isNaN(d.getTime())) allDates.push(d); 
        } 
      } 
    }); 
  });
  const today = new Date(); allDates.push(today);

  if (allDates.length <= 1) return (
    <div className="border rounded-xl p-16 text-center shadow-sm"><BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" /><h3 className="text-lg font-medium mb-1">No Dates Set</h3><p className="text-sm text-muted-foreground">Set milestone dates in Table view first.</p></div>
  );

  const minDate = new Date(Math.min(...allDates.map(d => d.getTime()))); minDate.setDate(minDate.getDate() - 21);
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime()))); maxDate.setDate(maxDate.getDate() + 28);
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (86400000)));
  const dayToX = (d: Date) => ((d.getTime() - minDate.getTime()) / 86400000) / totalDays * 100;

  const monthSteps: { label: string; x: number }[] = [];
  const weekSteps: { label: string; x: number }[] = [];
  const daySteps: { label: string; isWeekend?: boolean; x: number }[] = [];

  // Generate Months
  let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) { monthSteps.push({ label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), x: dayToX(cur) }); cur.setMonth(cur.getMonth() + 1); }

  // Generate Weeks (if zoom > 0.5)
  if (zoom > 0.5) {
    cur = new Date(minDate); cur.setDate(cur.getDate() - cur.getDay()); // Start of week
    while (cur <= maxDate) { 
      if (cur >= minDate) weekSteps.push({ label: `W${getWeek(cur)}`, x: dayToX(cur) }); 
      cur.setDate(cur.getDate() + 7); 
    }
  }

  // Generate Days (if zoom > 2)
  if (zoom > 2) {
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    cur = new Date(minDate);
    while (cur <= maxDate) {
      const dayNum = cur.getDay(); // 0 is Sun, 6 is Sat
      daySteps.push({ 
        label: dayLabels[dayNum], 
        isWeekend: dayNum === 0 || dayNum === 6,
        x: dayToX(cur) 
      }); 
      cur.setDate(cur.getDate() + 1); 
    }
  }

  const LABEL_W = 200;
  const HDR_H = 40;
  const ROW_H_BASE = 16;
  const GANTT_ROW_H = ROW_H_BASE + visibleDateTypes.length * 28;
  const HEADER_ROW_H = 32;

  const chartH = HDR_H + flatPackages.reduce((acc, curr: any) => acc + (curr.type === 'header' ? HEADER_ROW_H : GANTT_ROW_H), 0) + 20;
  const todayX = dayToX(today);
  const svgW = Math.max(1200, totalDays * 15 * zoom);
  const dayWidthPx = (1 / totalDays) * svgW;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 bg-muted/30 p-3 rounded-xl border">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {visibleDateTypes.map(dt => (
              <div key={dt} className="flex items-center gap-1.5 px-2 py-1 bg-background rounded-md border shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DATE_TYPE_COLORS[dt as keyof typeof DATE_TYPE_COLORS] }} />
                <span className="text-[10px] font-bold uppercase tracking-tight">{dt}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => setShowLegend(!showLegend)}>
               {showLegend ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
               {showLegend ? 'Hide Legend' : 'Show Legend'}
            </Button>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase ml-2">Zoom</span>
            <div className="flex items-center rounded-lg border bg-background p-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}><ZoomOut className="h-3.5 w-3.5" /></Button>
              <span className="text-[10px] font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(4, z + 0.25))}><ZoomIn className="h-3.5 w-3.5" /></Button>
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}><RotateCcw className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 border-t border-muted-foreground/10">
             {milestoneKeys.map(key => {
               const iconName = milestoneIcons[key] || MILESTONE_ICONS_MAP[key] || 'Play';
               const Icon = ICON_LIBRARY[iconName] || Play;
               return (
                 <div key={key} className="flex items-center gap-1.5">
                   <Icon className="h-3 w-3 text-primary/70" />
                   <span className="text-[10px] font-medium text-muted-foreground">{milestoneLabels[key] || key}</span>
                 </div>
               );
             })}
          </div>
        )}
      </div>
      
      <div className="border rounded-xl overflow-hidden bg-background shadow-sm relative">
        <div className="overflow-x-auto">
          <div style={{ display: 'flex', minHeight: chartH }}>
            {/* Legend Labels */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, borderRight: '1px solid hsl(var(--border))' }} className="bg-slate-50/50 dark:bg-muted/10 sticky left-0 z-20 backdrop-blur-sm">
              <div style={{ height: HDR_H }} className="border-b px-3 flex items-center text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Package</div>
              <div className="relative">
                {flatPackages.map((item: any, idx) => {
                  if (item.type === 'header') {
                    return (
                      <div key={`header-${item.label}`} style={{ height: HEADER_ROW_H }} className="px-3 flex items-center bg-muted/30 border-b cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleGroup(item.label)}>
                         {collapsedGroups.has(item.label) ? <ChevronRight className="h-3 w-3 mr-1.5" /> : <ChevronDown className="h-3 w-3 mr-1.5" />}
                         <div className="h-1.5 w-1.5 rounded-full mr-2" style={{ backgroundColor: GANTT_COLORS[item.label] || '#64748b' }} />
                         <span className="font-bold text-[9px] uppercase tracking-widest text-muted-foreground">{item.label}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={item.id} style={{ height: GANTT_ROW_H }} className={cn("px-3 flex flex-col justify-center border-b group", idx % 2 === 0 ? 'bg-background/40' : 'bg-muted/5')}>
                      <span className="truncate font-semibold text-[11px] text-foreground/80">{item.name}</span>
                      <span className="text-[9px] text-muted-foreground truncate">{item.awardedSupplierName || 'No Supplier'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Chart Area */}
            <div style={{ flex: 1, overflowX: 'auto' }}>
              <div style={{ width: svgW, position: 'relative' }}>
                <svg width={svgW} height={chartH} className="bg-background">
                  {/* Grid Lines & Labels */}
                  <g className="grid-lines">
                    {/* Months */}
                    {monthSteps.map((m, i) => {
                      const x = m.x / 100 * svgW;
                      return (
                        <g key={`month-${i}`}>
                          <line x1={x} y1={0} x2={x} y2={chartH} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="4 2" />
                          <text x={x + 6} y={18} className="fill-foreground/60 font-bold" fontSize={10}>{m.label}</text>
                        </g>
                      );
                    })}

                    {/* Weeks */}
                    {zoom > 0.5 && weekSteps.map((w, i) => {
                      const x = w.x / 100 * svgW;
                      return (
                        <g key={`week-${i}`}>
                          <line x1={x} y1={25} x2={x} y2={chartH} stroke="currentColor" strokeOpacity={0.08} />
                          <text x={x + 4} y={32} className="fill-muted-foreground/50 font-medium" fontSize={8}>{w.label}</text>
                        </g>
                      );
                    })}

                    {/* Days & Weekends */}
                    {zoom > 2 && daySteps.map((d, i) => {
                      const x = d.x / 100 * svgW;
                      return (
                        <g key={`day-${i}`}>
                          {d.isWeekend && <rect x={x} y={0} width={dayWidthPx} height={chartH} fill="currentColor" fillOpacity={typeof window !== 'undefined' && document.documentElement.classList.contains('dark') ? 0.08 : 0.04} />}
                          <line x1={x} y1={35} x2={x} y2={chartH} stroke="currentColor" strokeOpacity={0.04} />
                          <text x={x + dayWidthPx / 2} y={38} className="fill-muted-foreground font-semibold" fontSize={7} textAnchor="middle">{d.label}</text>
                        </g>
                      );
                    })}
                  </g>
                  
                  {/* Today Indicator */}
                  <line x1={todayX / 100 * svgW} y1={0} x2={todayX / 100 * svgW} y2={chartH} stroke="#ec4899" strokeWidth={1.5} strokeDasharray="3 2" />
                  <rect x={todayX / 100 * svgW - 20} y={HDR_H - 12} width={40} height={14} rx={4} fill="#ec4899" />
                  <text x={todayX / 100 * svgW} y={HDR_H - 2} fontSize={8} fill="white" textAnchor="middle" fontWeight={800} letterSpacing="0.05em">TODAY</text>
                  
                  {/* Rows */}
                  {(() => {
                    let currentY = HDR_H;
                    return flatPackages.map((item: any) => {
                      if (item.type === 'header') {
                        const y = currentY;
                        currentY += HEADER_ROW_H;
                        return (
                          <g key={`rect-header-${item.label}`}>
                            <rect x={0} y={y} width={svgW} height={HEADER_ROW_H} fill="currentColor" fillOpacity={0.03} />
                            <line x1={0} y1={y + HEADER_ROW_H} x2={svgW} y2={y + HEADER_ROW_H} stroke="currentColor" strokeOpacity={0.1} />
                          </g>
                        );
                      }
                      const y = currentY;
                      currentY += GANTT_ROW_H;
                      return (
                        <g key={`row-${item.id}`}>
                          <line x1={0} y1={y + GANTT_ROW_H} x2={svgW} y2={y + GANTT_ROW_H} stroke="currentColor" strokeOpacity={0.05} />
                          <GanttRow pkg={item} y={y} svgW={svgW} dayToX={dayToX} visibleTypes={visibleDateTypes} milestoneKeys={milestoneKeys} milestoneLabels={milestoneLabels} rowH={GANTT_ROW_H} />
                        </g>
                      );
                    });
                  })()}
                </svg>
                
                {/* Overlay Milestone Icons */}
                {(() => {
                  let currentY = HDR_H;
                  return flatPackages.map(item => {
                    if ((item as any).type === 'header') {
                      currentY += HEADER_ROW_H;
                      return null;
                    }
                    const pkg = item as SchedulePackage;
                    const y = currentY;
                    currentY += GANTT_ROW_H;
                    
                    return visibleDateTypes.map((dt, laneIdx) => {
                      const dtKey = dt === 'planned' ? 'plannedDate' : dt === 'forecast' ? 'adjustedDate' : 'actualDate';
                      const dtColor = DATE_TYPE_COLORS[dt as keyof typeof DATE_TYPE_COLORS];
                      const laneH = GANTT_ROW_H / visibleDateTypes.length;
                      const laneY = y + laneIdx * laneH;
                      
                      return milestoneKeys.map(key => {
                        const ms = pkg.milestones?.[key];
                        if (!ms) return null;
                        const val = (ms as any)[dtKey];
                        if (!val || val === 'TBD' || val === 'N/A') return null;
                        const d = new Date(val);
                        if (isNaN(d.getTime())) return null;
                        const xPx = dayToX(d) / 100 * svgW;
                        const iconName = milestoneIcons[key] || MILESTONE_ICONS_MAP[key] || 'Play';
                        const Icon = ICON_LIBRARY[iconName] || Play;
                        if (!Icon) return null;
                        
                        return (
                          <div key={`${pkg.id}-${dt}-${key}`} 
                            className="absolute flex items-center justify-center p-0.5 rounded-sm bg-background/90 group hover:scale-125 transition-transform cursor-help shadow-sm border" 
                            style={{ 
                              left: xPx - 9, 
                              top: laneY + laneH / 2 - 9, 
                              width: 18, 
                              height: 18,
                              borderColor: `${dtColor}33`
                            }} 
                            title={`${milestoneLabels[key]} (${dt}): ${val}`}
                          >
                            <Icon className="w-3 h-3" style={{ color: dtColor }} strokeWidth={2.5} />
                          </div>
                        );
                      });
                    });
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// === GANTT ROW ===
function GanttRow({ pkg, y, svgW, dayToX, visibleTypes, milestoneKeys, milestoneLabels, rowH }: {
  pkg: SchedulePackage; y: number; svgW: number; dayToX: (d: Date) => number;
  visibleTypes: ('planned' | 'forecast' | 'actual')[]; milestoneKeys: string[];
  milestoneLabels: Record<string, string>; rowH: number;
}) {
  const laneH = rowH / Math.max(visibleTypes.length, 1);

  return (
    <g>
      {visibleTypes.map((dateType, laneIdx) => {
        const dtKey = dateType === 'planned' ? 'plannedDate' : dateType === 'forecast' ? 'adjustedDate' : 'actualDate';
        const dtColor = DATE_TYPE_COLORS[dateType as keyof typeof DATE_TYPE_COLORS];
        const laneY = y + laneIdx * laneH;
        const barY = laneY + laneH / 2 - 2;

        const dots: number[] = [];
        milestoneKeys.forEach(key => {
          const val = (pkg.milestones?.[key] as any)?.[dtKey];
          if (val && val !== 'TBD' && val !== 'N/A') { 
            const d = new Date(val); 
            if (!isNaN(d.getTime())) dots.push(dayToX(d) / 100 * svgW); 
          }
        });

        if (dots.length === 0) return null;
        const minX = Math.min(...dots); const maxX = Math.max(...dots);

        return (
          <g key={dateType} className="hover:opacity-100 opacity-80 transition-opacity">
            <rect x={minX} y={barY} width={Math.max(4, maxX - minX)} height={4} rx={2} fill={dtColor} fillOpacity={0.3} />
            <rect x={minX} y={barY} width={Math.max(4, maxX - minX)} height={4} rx={2} stroke={dtColor} strokeWidth={1} fill="none" strokeDasharray="1 1" />
            <circle cx={minX} cy={barY + 2} r={2} fill={dtColor} />
            <circle cx={maxX} cy={barY + 2} r={2} fill={dtColor} />
          </g>
        );
      })}
    </g>
  );
}

// === RFP SELECTOR ===
function RfpSelector({ rfps, clientId, value, onChange }: { rfps: RFP[]; clientId: string; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [addRfpOpen, setAddRfpOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = rfps.find(r => r.id === value);
  const filtered = rfps.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 h-7 w-full rounded-md border border-input bg-background px-2 text-[10px] hover:bg-accent transition-colors text-left">
            <span className="truncate flex-1">{selected?.title || <span className="text-muted-foreground">Select RFP...</span>}</span>
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <Input placeholder="Search RFPs..." className="h-7 text-xs" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No RFPs found.</p>
            ) : filtered.map(r => (
              <button key={r.id} className={cn("flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left", r.id === value && "bg-accent")} onClick={() => { onChange(r.id); setOpen(false); setSearch(''); }}>
                <span className="truncate flex-1">{r.title}</span>
                <span className={cn("text-[8px] px-1 py-0.5 rounded border capitalize", r.status === 'published' ? "bg-green-100 text-green-700 border-green-200" : "bg-slate-100 text-slate-700 border-slate-200")}>{r.status}</span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t">
            <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" onClick={() => { setOpen(false); setAddRfpOpen(true); }}>
              <Plus className="mr-1 h-3 w-3" /> Add RFP
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {addRfpOpen && (
        <AddRfpDialog 
          open={addRfpOpen} 
          onOpenChange={setAddRfpOpen} 
          clientId={clientId} 
          onCreated={(rfpId) => { onChange(rfpId); setAddRfpOpen(false); }} 
        />
      )}
    </>
  );
}

// === QUICK ADD RFP DIALOG ===
function AddRfpDialog({ open, onOpenChange, clientId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; clientId: string; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    openDate: format(new Date(), 'yyyy-MM-dd'),
    closeDate: format(new Date(Date.now() + 14 * 86400000), 'yyyy-MM-dd'),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title || !formData.description) return;
    setLoading(true);
    try {
      const newRfp = {
        title: formData.title,
        description: formData.description,
        clientId: clientId,
        status: 'draft',
        flowType: 'simple',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        openDate: Timestamp.fromDate(new Date(formData.openDate)),
        closeDate: Timestamp.fromDate(new Date(formData.closeDate)),
        countryCode: 'US', 
        cityName: 'TBD',
        budget: 0,
        isConfidential: false,
        attachedFiles: [],
      };
      const docRef = await addDoc(collection(db, 'rfps'), newRfp);
      logAudit({ action: 'rfp.created', category: 'rfp', targetCollection: 'rfps', targetDocId: docRef.id, details: { title: newRfp.title } });
      onCreated(docRef.id);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>Quick Add RFP</DialogTitle><DialogDescription>Create a basic RFP. You can add more details later in the RFP section.</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2"><Label>Title</Label><Input required value={formData.title} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} placeholder="RFP Title" /></div>
          <div className="space-y-2"><Label>Description</Label><textarea className="w-full min-h-[80px] p-2 text-sm border rounded-md bg-transparent focus:ring-1 focus:ring-primary outline-none" required value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Open Date</Label><Input type="date" required value={formData.openDate} onChange={e => setFormData(prev => ({ ...prev, openDate: e.target.value }))} className="text-sm" /></div>
            <div className="space-y-2"><Label>Close Date</Label><Input type="date" required value={formData.closeDate} onChange={e => setFormData(prev => ({ ...prev, closeDate: e.target.value }))} className="text-sm" /></div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Create & Associate</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
