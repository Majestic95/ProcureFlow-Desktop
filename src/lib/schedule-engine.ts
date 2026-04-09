import type { EquipmentPackage, MilestoneData, RagStatus } from '@/types';
import { MILESTONE_KEYS, DEFAULT_MILESTONE_DURATIONS, COMPLETION_MILESTONES } from '@/types';

/**
 * Add business days to a date (skips weekends).
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return result;
}

/**
 * Subtract business days from a date.
 */
function subtractBusinessDays(date: Date, days: number): Date {
  return addBusinessDays(date, -days);
}

/**
 * Format a Date to ISO date string (YYYY-MM-DD).
 */
function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse a date string that might be ISO, 'TBD', or 'N/A'.
 * Returns null if not a valid date.
 */
function parseDate(val: string | undefined): Date | null {
  if (!val || val === 'TBD' || val === 'N/A') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Generate a backward-pass schedule for a package.
 *
 * Starting from the ROJ date (= delivery date), walks backward through
 * milestones using durations to calculate planned dates.
 *
 * @param rojDate - Required on Job date (ISO string)
 * @param leadTimeWeeks - Manufacturing lead time in weeks
 * @param durations - Business day durations per milestone (uses defaults for missing keys)
 * @param milestoneKeys - Ordered list of milestone keys
 * @returns Record of milestone key → planned date (ISO string)
 */
export function generateBackwardPassSchedule(
  rojDate: string,
  leadTimeWeeks: number,
  durations: Record<string, number>,
  milestoneKeys: string[] = [...MILESTONE_KEYS]
): Record<string, string> {
  const roj = parseDate(rojDate);
  if (!roj) return {};
  if (milestoneKeys.length === 0) return {};

  const mergedDurations = { ...DEFAULT_MILESTONE_DURATIONS, ...durations };

  // Production duration = leadTimeWeeks × 5 business days
  mergedDurations.production = leadTimeWeeks * 5;

  // Build dates backward from delivery
  const dates: Record<string, Date> = {};
  const reversedKeys = [...milestoneKeys].reverse();

  // Delivery = ROJ date
  dates.delivery = new Date(roj);

  for (const key of reversedKeys) {
    if (key === 'delivery') continue;

    const nextKeyIndex = milestoneKeys.indexOf(key) + 1;
    if (nextKeyIndex < milestoneKeys.length) {
      const nextKey = milestoneKeys[nextKeyIndex];
      const nextDate = dates[nextKey];
      if (nextDate) {
        const duration = mergedDurations[key] || 0;
        dates[key] = subtractBusinessDays(nextDate, duration);
      }
    }
  }

  // Convert to ISO strings
  const result: Record<string, string> = {};
  for (const key of milestoneKeys) {
    result[key] = dates[key] ? toIsoDate(dates[key]) : 'TBD';
  }
  return result;
}

/**
 * Generate a forward-pass schedule for a package.
 *
 * Starting from a Project Start date, walks forward through milestones
 * using durations to calculate planned dates. Delivery date is the output.
 *
 * @param startDate - Project start date (ISO string)
 * @param leadTimeWeeks - Manufacturing lead time in weeks
 * @param durations - Business day durations per milestone (uses defaults for missing keys)
 * @param milestoneKeys - Ordered list of milestone keys
 * @returns Record of milestone key → planned date (ISO string)
 */
export function generateForwardPassSchedule(
  startDate: string,
  leadTimeWeeks: number,
  durations: Record<string, number>,
  milestoneKeys: string[] = [...MILESTONE_KEYS]
): Record<string, string> {
  const start = parseDate(startDate);
  if (!start) return {};
  if (milestoneKeys.length === 0) return {};

  const mergedDurations = { ...DEFAULT_MILESTONE_DURATIONS, ...durations };
  mergedDurations.production = leadTimeWeeks * 5;

  const dates: Record<string, Date> = {};

  // Project Start = user-entered start date
  dates[milestoneKeys[0]] = new Date(start);

  // Walk forward: each milestone starts after the previous one's duration
  for (let i = 1; i < milestoneKeys.length; i++) {
    const prevKey = milestoneKeys[i - 1];
    const prevDate = dates[prevKey];
    if (prevDate) {
      const prevDuration = mergedDurations[prevKey] || 0;
      dates[milestoneKeys[i]] = addBusinessDays(prevDate, prevDuration);
    }
  }

  const result: Record<string, string> = {};
  for (const key of milestoneKeys) {
    result[key] = dates[key] ? toIsoDate(dates[key]) : 'TBD';
  }
  return result;
}

/**
 * Apply auto-generated dates to a package's milestones.
 * Only fills dates that are currently 'TBD' — does not overwrite existing dates.
 *
 * @param pkg - The equipment package
 * @param milestoneKeys - Ordered milestone keys
 * @param overwrite - If true, overwrites all planned dates. If false, only fills TBD.
 * @returns Updated milestones record
 */
export function applyAutoSchedule(
  pkg: EquipmentPackage,
  milestoneKeys: string[] = [...MILESTONE_KEYS],
  overwrite = false
): Record<string, MilestoneData> {
  if (!pkg.rojDate || pkg.rojDate === 'TBD' || !pkg.leadTimeWeeks) {
    return pkg.milestones;
  }

  const durations = pkg.milestoneDurations || {};
  const generated = generateBackwardPassSchedule(
    pkg.rojDate,
    pkg.leadTimeWeeks,
    durations,
    milestoneKeys
  );

  const updated = { ...pkg.milestones };

  for (const key of milestoneKeys) {
    const existing = updated[key] || { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
    const generatedDate = generated[key];

    if (generatedDate && generatedDate !== 'TBD') {
      updated[key] = {
        ...existing,
        plannedDate: (overwrite || existing.plannedDate === 'TBD')
          ? generatedDate
          : existing.plannedDate,
      };
    } else {
      updated[key] = existing;
    }
  }

  return updated;
}

/**
 * Calculate % complete for a package.
 * Based on procurement milestones (up to and including PO Issue) that have actual dates.
 */
export function calculatePercentComplete(
  milestones: Record<string, MilestoneData>
): number {
  let completed = 0;
  let total = 0;

  for (const key of COMPLETION_MILESTONES) {
    total++;
    const ms = milestones[key];
    if (ms?.actualDate && ms.actualDate !== 'TBD' && ms.actualDate !== 'N/A') {
      completed++;
    }
  }

  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Calculate RAG status for a package.
 *
 * - Done: PO Issue has an actual date
 * - On Track: all forecast dates are on or before planned dates
 * - At Risk: any forecast date exceeds planned by 1-14 days
 * - Late: any forecast date exceeds planned by >14 days, or a milestone
 *         is past its planned date with no actual date
 */
export function calculateRagStatus(
  milestones: Record<string, MilestoneData>,
  milestoneKeys: string[] = [...MILESTONE_KEYS]
): RagStatus {
  // Check if PO is done
  const poIssue = milestones.poIssue;
  if (poIssue?.actualDate && poIssue.actualDate !== 'TBD' && poIssue.actualDate !== 'N/A') {
    return 'done';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let maxSlipDays = 0;

  for (const key of milestoneKeys) {
    const ms = milestones[key];
    if (!ms) continue;

    // Skip milestones that are already completed
    if (ms.actualDate && ms.actualDate !== 'TBD' && ms.actualDate !== 'N/A') continue;

    const planned = parseDate(ms.plannedDate);
    const forecast = parseDate(ms.adjustedDate);

    if (planned) {
      // Check if planned date is in the past with no actual
      if (planned < today) {
        const daysPastDue = Math.floor((today.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24));
        maxSlipDays = Math.max(maxSlipDays, daysPastDue);
      }

      // Check forecast vs planned
      if (forecast && forecast > planned) {
        const slipDays = Math.floor((forecast.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24));
        maxSlipDays = Math.max(maxSlipDays, slipDays);
      }
    }
  }

  if (maxSlipDays > 14) return 'late';
  if (maxSlipDays > 0) return 'at-risk';
  return 'on-track';
}

/**
 * Recalculate computed fields on a package (percentComplete + ragStatus).
 * Call this before saving a package to Firestore.
 */
export function recomputePackageMetrics(
  pkg: EquipmentPackage,
  milestoneKeys: string[] = [...MILESTONE_KEYS]
): Pick<EquipmentPackage, 'percentComplete' | 'ragStatus'> {
  return {
    percentComplete: calculatePercentComplete(pkg.milestones),
    ragStatus: calculateRagStatus(pkg.milestones, milestoneKeys),
  };
}
