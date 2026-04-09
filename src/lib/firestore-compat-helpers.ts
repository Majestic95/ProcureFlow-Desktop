/**
 * Helper functions for the Firestore compatibility layer.
 * Extracted to keep firestore-compat.ts under the 500-line cap.
 */

import { db as sqlDb } from '@/lib/db';
import type { QueryRef } from '@/lib/firestore-compat-types';
import { isFieldSentinel } from '@/lib/firestore-compat-types';
import type {
  ArrayUnionSentinel, ArrayRemoveSentinel,
  IncrementSentinel, DeleteFieldSentinel,
} from '@/lib/firestore-compat-types';

// Re-exported by firestore-compat.ts for consumer use
export type { ArrayUnionSentinel, ArrayRemoveSentinel, IncrementSentinel, DeleteFieldSentinel };

// ---- Subcollection mapping (shared with firestore-compat.ts) ----

export const SUBCOLLECTION_MAP: Record<string, { table: string; fkColumn: string }> = {
  'packages': { table: 'packages', fkColumn: 'project_id' },
  'change_orders': { table: 'change_orders', fkColumn: 'project_id' },
  'changeOrders': { table: 'change_orders', fkColumn: 'project_id' },
  'risks': { table: 'risks', fkColumn: 'project_id' },
  'todos': { table: 'todos', fkColumn: 'project_id' },
  'deliveries': { table: 'deliveries', fkColumn: 'project_id' },
  'contracts': { table: 'contracts', fkColumn: 'project_id' },
  'questions': { table: 'questions', fkColumn: 'project_id' },
  'coverage': { table: 'coverage', fkColumn: 'supplier_id' },
  'prequalifications': { table: 'prequalifications', fkColumn: 'supplier_id' },
  'schedule_packages': { table: 'schedule_packages', fkColumn: 'schedule_id' },
  'activityComments': { table: 'activity_comments', fkColumn: 'schedule_id' },
  'activity_comments': { table: 'activity_comments', fkColumn: 'schedule_id' },
  'rfp_questions': { table: 'rfp_questions', fkColumn: 'rfp_id' },
};

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

const VALID_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Validate that a string is a safe SQL identifier (column/table name) */
export function isValidSqlIdentifier(name: string): boolean {
  return VALID_SQL_IDENTIFIER.test(name) && name.length <= 64;
}

export function tryParseJson(s: string): unknown[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Convert data for writing: handle sentinels, serialize objects, convert dates */
export function prepareWriteData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const now = new Date().toISOString();

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Guard against prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    // ISO timestamp strings that match "just now" are likely serverTimestamp() results
    if (typeof value === 'string' && value.length > 20 && value.endsWith('Z') && value.startsWith('20')) {
      result[key] = value;
      continue;
    }

    // Field transform sentinels (handled properly in updateDoc, fallback here for addDoc/setDoc)
    if (isFieldSentinel(value)) {
      if (value._type === 'arrayUnion') {
        result[key] = JSON.stringify(value.elements);
      } else if (value._type === 'arrayRemove') {
        result[key] = JSON.stringify([]);
      } else if (value._type === 'increment') {
        result[key] = value.value;
      } else if (value._type === 'deleteField') {
        result[key] = null;
      }
      continue;
    }

    // Serialize arrays and objects for JSON storage
    if (Array.isArray(value) || (typeof value === 'object' && value !== null && !(value instanceof Date))) {
      result[key] = JSON.stringify(value);
      continue;
    }

    // Convert Date to ISO string
    if (value instanceof Date) {
      result[key] = value.toISOString();
      continue;
    }

    result[key] = value;
  }

  return result;
}

/** Build SQL from a QueryRef and execute it. All field/table names are validated. */
export async function buildAndExecuteQuery(q: QueryRef): Promise<Array<Record<string, unknown>>> {
  if (!isValidSqlIdentifier(q._table)) {
    throw new Error(`Invalid table name: ${q._table}`);
  }

  let sql = `SELECT * FROM ${q._table}`;
  const params: string[] = [];
  const conditions: string[] = [];

  if (q._parentId) {
    const sub = Object.values(SUBCOLLECTION_MAP).find(s => s.table === q._table);
    const fk = sub?.fkColumn || 'project_id';
    if (!isValidSqlIdentifier(fk)) throw new Error(`Invalid FK column: ${fk}`);
    conditions.push(`${fk} = ?${params.length + 1}`);
    params.push(q._parentId);
  }

  for (const f of q._filters) {
    if (!isValidSqlIdentifier(f.field)) {
      throw new Error(`Invalid field name in WHERE: ${f.field}`);
    }

    if (f.op === 'array-contains') {
      conditions.push(`${f.field} LIKE ?${params.length + 1}`);
      params.push(`%${String(f.value)}%`);
    } else if (f.op === 'in' && Array.isArray(f.value)) {
      const placeholders = f.value.map((_, i) => `?${params.length + i + 1}`).join(', ');
      conditions.push(`${f.field} IN (${placeholders})`);
      params.push(...f.value.map(String));
    } else {
      const ALLOWED_OPS = ['=', '!=', '<', '<=', '>', '>='];
      const sqlOp = f.op === '==' ? '=' : f.op === '!=' ? '!=' : f.op;
      if (!ALLOWED_OPS.includes(sqlOp)) throw new Error(`Invalid SQL operator: ${f.op}`);
      conditions.push(`${f.field} ${sqlOp} ?${params.length + 1}`);
      params.push(String(f.value));
    }
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (q._orderBy) {
    if (!isValidSqlIdentifier(q._orderBy.field)) {
      throw new Error(`Invalid ORDER BY field: ${q._orderBy.field}`);
    }
    const dir = q._orderBy.direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${q._orderBy.field} ${dir}`;
  }

  if (q._limit && Number.isInteger(q._limit) && q._limit > 0) {
    sql += ` LIMIT ${q._limit}`;
  }

  return sqlDb.query<Record<string, unknown>>(sql, params);
}

// ---- Sentinel factory functions ----

export function arrayUnion(...elements: unknown[]): ArrayUnionSentinel {
  return { _type: 'arrayUnion', elements };
}

export function arrayRemove(...elements: unknown[]): ArrayRemoveSentinel {
  return { _type: 'arrayRemove', elements };
}

export function increment(n: number): IncrementSentinel {
  return { _type: 'increment', value: n };
}

export function deleteField(): DeleteFieldSentinel {
  return { _type: 'deleteField' };
}
