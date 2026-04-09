import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ensureDate(date: any): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'string') return new Date(date);
  if (typeof date === 'number') return new Date(date);
  return new Date();
}

export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ensureIsoString(date: any): string {
  return ensureDate(date).toISOString();
}

/**
 * Batch an array of IDs into chunks of 30 for Firestore 'in' queries.
 * Firestore limits 'in' queries to 30 elements max.
 */
export function batchIds<T>(ids: T[], size = 30): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}
