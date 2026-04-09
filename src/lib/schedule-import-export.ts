/**
 * Import/Export utilities for schedule data (Excel).
 * Extracted from the old schedules/[id]/page.tsx to keep schedule-tab.tsx lean.
 */

import * as XLSX from 'xlsx';
import type { EquipmentPackage, MilestoneData } from '@/types';
import { MILESTONE_KEYS, MILESTONE_LABELS, DISCIPLINES } from '@/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parseTypedDate(raw: string): string {
  if (!raw || raw === 'TBD' || raw === 'N/A') return raw || 'TBD';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    const y = slashMatch[3].length === 2 ? '20' + slashMatch[3] : slashMatch[3];
    return `${y}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }
  return raw;
}

export function formatDisplay(val: string) {
  if (val === 'TBD' || val === 'N/A') return val;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const yy = d.getFullYear().toString().slice(2);
    return `${mm}/${dd}/${yy}`;
  } catch {
    return val;
  }
}

export function emptyMilestones(keys: string[]): Record<string, MilestoneData> {
  return Object.fromEntries(
    keys.map(k => [k, { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' }]),
  );
}

// ---------------------------------------------------------------------------
// Validation error type
// ---------------------------------------------------------------------------

export interface ValidationError {
  row: number;
  column: string;
  message: string;
  value?: string;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportToExcel(
  packages: EquipmentPackage[],
  projectName: string,
  milestoneKeys: string[],
  milestoneLabels: Record<string, string>,
) {
  const headers = ['Package', 'Quantity', 'Supplier', 'Associated RFP ID', 'Comment', 'Discipline'];
  milestoneKeys.forEach(key => {
    ['Planned', 'Forecast', 'Actual'].forEach(dt => headers.push(`${milestoneLabels[key] || key} (${dt})`));
  });

  const data: any[][] = [headers];
  packages.forEach(pkg => {
    const row: any[] = [
      pkg.name || '',
      pkg.quantity ?? '',
      pkg.awardedSupplierName || '',
      pkg.associatedRfpId || '',
      pkg.comment || '',
      pkg.discipline || 'Others',
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
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length, 15) }));
  XLSX.writeFile(wb, `${projectName.replace(/\s+/g, '_')}_schedule.xlsx`);
}

// ---------------------------------------------------------------------------
// Import (header-based column matching)
// ---------------------------------------------------------------------------

export function processImportRows(
  rows: string[][],
  milestoneKeys: string[],
  milestoneLabels: Record<string, string>,
  existingPackages: EquipmentPackage[],
  allDisciplines: string[],
): {
  imported: EquipmentPackage[];
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: { added: number; updated: number; unchanged: number };
} {
  if (rows.length < 2) throw new Error('File is empty or has no data rows.');

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const headers = rows[0].map(h => (h || '').trim());

  // -- Header-based column matching --
  const META_COLUMNS: Record<string, string> = {
    Package: 'name',
    Quantity: 'quantity',
    Supplier: 'awardedSupplierName',
    'Associated RFP ID': 'associatedRfpId',
    Comment: 'comment',
    Discipline: 'discipline',
  };

  const colMap: Record<string, number> = {};
  for (const headerName of Object.keys(META_COLUMNS)) {
    const idx = headers.findIndex(h => h.toLowerCase() === headerName.toLowerCase());
    if (idx !== -1) colMap[headerName] = idx;
  }

  // Required columns
  if (colMap['Package'] === undefined) {
    errors.push({ row: 1, column: 'Package', message: `Required column "Package" not found in headers. Found: ${headers.join(', ')}` });
    return { imported: [], errors, warnings, stats: { added: 0, updated: 0, unchanged: 0 } };
  }

  // Milestone columns
  const milestoneColMap: Record<string, { planned?: number; forecast?: number; actual?: number }> = {};
  headers.forEach((h, idx) => {
    const pm = h.match(/^(.+?)\s*\(Planned\)$/i);
    const fm = h.match(/^(.+?)\s*\(Forecast\)$/i);
    const am = h.match(/^(.+?)\s*\(Actual\)$/i);
    if (pm) { const l = pm[1].trim(); if (!milestoneColMap[l]) milestoneColMap[l] = {}; milestoneColMap[l].planned = idx; }
    else if (fm) { const l = fm[1].trim(); if (!milestoneColMap[l]) milestoneColMap[l] = {}; milestoneColMap[l].forecast = idx; }
    else if (am) { const l = am[1].trim(); if (!milestoneColMap[l]) milestoneColMap[l] = {}; milestoneColMap[l].actual = idx; }
  });

  const labelToKey: Record<string, string> = {};
  for (const key of milestoneKeys) {
    labelToKey[(milestoneLabels[key] || key).toLowerCase()] = key;
  }

  for (const label of Object.keys(milestoneColMap)) {
    if (!labelToKey[label.toLowerCase()]) {
      warnings.push({ row: 1, column: label, message: `Unknown milestone "${label}" — will be added as a new milestone.` });
    }
  }

  // Warn about unrecognized columns
  const knownIndices = new Set([
    ...Object.values(colMap),
    ...Object.values(milestoneColMap).flatMap(m => [m.planned, m.forecast, m.actual].filter((v): v is number => v !== undefined)),
  ]);
  headers.forEach((h, idx) => {
    if (h && !knownIndices.has(idx)) {
      warnings.push({ row: 1, column: h, message: `Column "${h}" not recognized — will be ignored.` });
    }
  });

  // -- Parse rows --
  const parsed: EquipmentPackage[] = [];
  const seenNames = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.every(c => !c?.trim())) continue;
    const rowNum = i + 1;

    const pkgName = (cols[colMap['Package']] || '').trim();
    if (!pkgName) { errors.push({ row: rowNum, column: 'Package', message: 'Package Name is required.' }); continue; }
    if (seenNames.has(pkgName.toLowerCase())) { errors.push({ row: rowNum, column: 'Package', message: `Duplicate package name "${pkgName}".` }); continue; }
    seenNames.add(pkgName.toLowerCase());

    const rawDisc = colMap['Discipline'] !== undefined ? (cols[colMap['Discipline']] || '').trim() : '';
    let discipline = rawDisc || 'Others';
    if (rawDisc && !allDisciplines.includes(rawDisc)) {
      warnings.push({ row: rowNum, column: 'Discipline', message: `Unknown discipline "${rawDisc}" — mapped to "Others".`, value: rawDisc });
      discipline = 'Others';
    }

    const ms: Record<string, MilestoneData> = {};
    for (const [label, colIndices] of Object.entries(milestoneColMap)) {
      const key = labelToKey[label.toLowerCase()] || label.replace(/\s+/g, '').replace(/^(.)/, m => m.toLowerCase());
      const milestoneData: any = {};
      for (const dt of [
        { field: 'plannedDate', colIdx: colIndices.planned, label: 'Planned' },
        { field: 'adjustedDate', colIdx: colIndices.forecast, label: 'Forecast' },
        { field: 'actualDate', colIdx: colIndices.actual, label: 'Actual' },
      ]) {
        const rawVal = dt.colIdx !== undefined ? (cols[dt.colIdx] || '').trim() : '';
        const p = parseTypedDate(rawVal);
        if (p !== 'TBD' && p !== 'N/A' && p && !/^\d{4}-\d{2}-\d{2}$/.test(p)) {
          errors.push({ row: rowNum, column: `${label} (${dt.label})`, message: 'Invalid date format. Use MM/DD/YYYY or YYYY-MM-DD.', value: rawVal });
        }
        milestoneData[dt.field] = p || 'TBD';
      }
      ms[key] = milestoneData;
    }

    for (const key of milestoneKeys) {
      if (!ms[key]) ms[key] = { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
    }

    parsed.push({
      id: crypto.randomUUID(),
      name: pkgName,
      discipline,
      itemNumber: 0,
      quantity: colMap['Quantity'] !== undefined ? (parseInt((cols[colMap['Quantity']] || '').trim()) || undefined) : undefined,
      awardedSupplierName: colMap['Supplier'] !== undefined ? (cols[colMap['Supplier']] || '').trim() || undefined : undefined,
      associatedRfpId: colMap['Associated RFP ID'] !== undefined ? (cols[colMap['Associated RFP ID']] || '').trim() || undefined : undefined,
      comment: colMap['Comment'] !== undefined ? (cols[colMap['Comment']] || '').trim() || undefined : undefined,
      milestones: ms,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EquipmentPackage);
  }

  // -- Merge with existing --
  const existingByName = new Map(existingPackages.map(p => [p.name.toLowerCase(), p]));
  const merged: EquipmentPackage[] = [];
  let added = 0, updated = 0, unchanged = 0;

  for (const imp of parsed) {
    const existing = existingByName.get(imp.name.toLowerCase());
    if (existing) {
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
      merged.push(imp);
      added++;
    }
  }

  for (const remaining of existingByName.values()) {
    merged.push(remaining);
    unchanged++;
  }

  return { imported: merged, errors, warnings, stats: { added, updated, unchanged } };
}

// ---------------------------------------------------------------------------
// Read file into rows (Excel or CSV)
// ---------------------------------------------------------------------------

export function readFileToRows(
  result: ArrayBuffer | string,
  isExcel: boolean,
): string[][] {
  if (isExcel) {
    const data = new Uint8Array(result as ArrayBuffer);
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
    return raw.map(r => r.map(c => (c != null ? String(c).trim() : '')));
  }
  // CSV fallback
  const text = result as string;
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const res: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) { res.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    res.push(cur.trim());
    return res.map(v => v.replace(/^"|"$/g, '').trim());
  });
}
