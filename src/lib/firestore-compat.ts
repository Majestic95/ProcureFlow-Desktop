/**
 * Firestore SDK compatibility layer for local SQLite.
 *
 * Provides drop-in replacements for all firebase/firestore functions
 * used across the codebase. Components import from here instead of
 * 'firebase/firestore', and the same API works against local SQLite.
 *
 * This is a transitional layer. Future development can gradually
 * migrate components to use db.ts directly.
 */

import { db as sqlDb } from '@/lib/db';
import { dataEvents } from '@/lib/data-events';
import type {
  CollectionRef, DocRef, QueryRef,
  DocumentSnapshotLike, TransactionLike,
} from '@/lib/firestore-compat-types';
import { isFieldSentinel } from '@/lib/firestore-compat-types';
import {
  SUBCOLLECTION_MAP, camelToSnake, tryParseJson,
  prepareWriteData, buildAndExecuteQuery,
} from '@/lib/firestore-compat-helpers';

// Re-export types and functions so consumers can import from this single file
export type { CollectionRef, DocRef, QueryRef } from '@/lib/firestore-compat-types';
export {
  Timestamp,
  type FieldValue, type DocumentData, type DocumentReference,
  type CollectionReference, type Query, type DocumentSnapshot, type QuerySnapshot,
} from '@/lib/firestore-compat-types';
export {
  arrayUnion, arrayRemove, increment, deleteField,
} from '@/lib/firestore-compat-helpers';

// Firestore camelCase collection names → SQLite snake_case table names
const TABLE_MAP: Record<string, string> = {
  'audit_logs': 'audit_logs',
  'auditLogs': 'audit_logs',
  'change_orders': 'change_orders',
  'changeOrders': 'change_orders',
  'schedule_packages': 'schedule_packages',
  'schedulePackages': 'schedule_packages',
  'app_config': 'app_config',
  'emailTemplates': 'templates',
  'profiles': 'users',
  'rfp_questions': 'rfp_questions',
  'activityComments': 'activity_comments',
  'invites': 'invites',
};

function resolveTable(name: string): string {
  return TABLE_MAP[name] || name;
}

// ---- Core functions ----

/**
 * collection(db, 'tableName')
 * collection(db, 'parentTable', parentId, 'subcollection') — Firestore subcollection
 * collection(docRef, 'subcollection')
 */
export function collection(_dbOrRef: unknown, path: string, ...rest: unknown[]): CollectionRef {
  // 4-arg form: collection(db, 'projects', projectId, 'packages')
  if (rest.length >= 2) {
    const parentId = rest[0] as string;
    const subName = rest[1] as string;
    const sub = SUBCOLLECTION_MAP[subName];
    if (sub) {
      return {
        _type: 'collection',
        _table: sub.table,
        _parentId: parentId,
        _parentTable: resolveTable(path),
      };
    }
    return { _type: 'collection', _table: resolveTable(subName) };
  }

  // Check if first arg is a DocRef (subcollection case)
  if (_dbOrRef && typeof _dbOrRef === 'object' && (_dbOrRef as DocRef)._type === 'doc') {
    const parentRef = _dbOrRef as DocRef;
    const sub = SUBCOLLECTION_MAP[path];
    if (sub) {
      return {
        _type: 'collection',
        _table: sub.table,
        _parentId: parentRef._id,
        _parentTable: parentRef._table,
      };
    }
    // Fallback: treat as top-level
    return { _type: 'collection', _table: resolveTable(path) };
  }

  return { _type: 'collection', _table: resolveTable(path) };
}

/**
 * collectionGroup(db, 'subcollectionName') — queries across all parent docs
 */
export function collectionGroup(_db: unknown, path: string): CollectionRef {
  const sub = SUBCOLLECTION_MAP[path];
  return { _type: 'collection', _table: sub?.table || resolveTable(path) };
}

/**
 * doc(db, 'table', 'id')
 * doc(db, 'parentTable', parentId, 'subName', docId) — subcollection document
 * doc(collectionRef, 'id')
 */
export function doc(
  _dbOrCollRef: unknown,
  pathOrId: string,
  ...rest: string[]
): DocRef {
  // doc(collectionRef, 'id')
  if (_dbOrCollRef && typeof _dbOrCollRef === 'object' && (_dbOrCollRef as CollectionRef)._type === 'collection') {
    const colRef = _dbOrCollRef as CollectionRef;
    return { _type: 'doc', _table: colRef._table, _id: pathOrId, id: pathOrId };
  }

  // doc(db, 'parentTable', parentId, 'subName', docId) — 5-arg subcollection form
  if (rest.length >= 3) {
    const subName = rest[1];
    const docId = rest[2];
    const sub = SUBCOLLECTION_MAP[subName];
    const table = sub?.table || resolveTable(subName);
    return { _type: 'doc', _table: table, _id: docId, id: docId };
  }

  // doc(db, 'table', 'id') — standard 3-arg form
  const id = rest[0] || '';
  return { _type: 'doc', _table: resolveTable(pathOrId), _id: id, id };
}

/**
 * query(collectionRef, ...constraints)
 */
export function query(colRef: CollectionRef, ...constraints: unknown[]): QueryRef {
  const q: QueryRef = {
    _type: 'query',
    _table: colRef._table,
    _filters: [],
    _parentId: colRef._parentId,
    _parentTable: colRef._parentTable,
  };

  for (const c of constraints) {
    if (c && typeof c === 'object') {
      const constraint = c as Record<string, unknown>;
      if (constraint._constraintType === 'where') {
        q._filters.push({
          field: constraint._field as string,
          op: constraint._op as string,
          value: constraint._value,
        });
      } else if (constraint._constraintType === 'orderBy') {
        q._orderBy = {
          field: constraint._field as string,
          direction: constraint._direction as string || 'asc',
        };
      } else if (constraint._constraintType === 'limit') {
        q._limit = constraint._value as number;
      }
    }
  }

  return q;
}

/**
 * where('field', 'op', value)
 */
export function where(field: string, op: string, value: unknown) {
  // Firestore's __name__ refers to the document ID; map to SQLite 'id' column
  const resolvedField = field === '__name__' ? 'id' : camelToSnake(field);
  return { _constraintType: 'where', _field: resolvedField, _op: op, _value: value };
}

/**
 * orderBy('field', 'asc'|'desc')
 */
export function orderBy(field: string, direction: string = 'asc') {
  return { _constraintType: 'orderBy', _field: camelToSnake(field), _direction: direction };
}

/**
 * limit(n)
 */
export function limit(n: number) {
  return { _constraintType: 'limit', _value: n };
}

/**
 * startAfter() — not meaningfully used; stub for compilation
 */
export function startAfter(..._args: unknown[]) {
  return { _constraintType: 'startAfter' };
}

/**
 * serverTimestamp() — returns current ISO timestamp
 */
export function serverTimestamp(): string {
  return new Date().toISOString();
}

// ---- Read operations ----

/** Wraps a SQLite row to look like a Firestore DocumentSnapshot */
function makeDocSnap(table: string, row: Record<string, unknown> | null) {
  if (!row) {
    return {
      exists: () => false,
      data: () => undefined,
      id: '',
      ref: { _type: 'doc' as const, _table: table, _id: '', id: '' },
    };
  }
  const id = (row.id as string) || '';
  return {
    exists: () => true,
    data: () => row,
    id,
    ref: { _type: 'doc' as const, _table: table, _id: id, id },
  };
}

/** Wraps SQLite rows to look like a Firestore QuerySnapshot */
function makeQuerySnap(table: string, rows: Array<Record<string, unknown>>) {
  const docs = rows.map((row) => makeDocSnap(table, row));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb: (doc: ReturnType<typeof makeDocSnap>) => void) => docs.forEach(cb),
  };
}

/**
 * getDoc(docRef) — fetch a single document
 */
export async function getDoc(ref: DocRef) {
  const row = await sqlDb.getById<Record<string, unknown>>(ref._table, ref._id);
  return makeDocSnap(ref._table, row);
}

/**
 * getDocs(queryOrCollectionRef) — fetch multiple documents
 */
export async function getDocs(ref: CollectionRef | QueryRef) {
  if (ref._type === 'query') {
    const q = ref as QueryRef;
    const rows = await buildAndExecuteQuery(q);
    return makeQuerySnap(q._table, rows);
  }

  // Simple collection ref
  const colRef = ref as CollectionRef;
  let rows: Array<Record<string, unknown>>;

  if (colRef._parentId) {
    // Subcollection: filter by parent FK
    const sub = Object.values(SUBCOLLECTION_MAP).find(s => s.table === colRef._table);
    const fk = sub?.fkColumn || 'project_id';
    rows = await sqlDb.getAll<Record<string, unknown>>(colRef._table, fk, colRef._parentId);
  } else {
    rows = await sqlDb.getAll<Record<string, unknown>>(colRef._table);
  }

  return makeQuerySnap(colRef._table, rows);
}

/**
 * onSnapshot(ref, callback) — simulates real-time listener.
 * Fetches immediately, then re-fetches whenever the data event bus
 * signals a change to the relevant table. This provides reactivity:
 * when any component writes to a table, all active listeners on that
 * table automatically refresh.
 */
export function onSnapshot(
  ref: CollectionRef | QueryRef | DocRef,
  callbackOrOptions: ((snap: any) => void) | { next: (snap: any) => void },
  maybeCallback?: (snap: any) => void,
) {
  const callback = typeof callbackOrOptions === 'function'
    ? callbackOrOptions
    : maybeCallback || callbackOrOptions.next;

  let cancelled = false;
  const table = ref._table;

  const fetchAndNotify = async () => {
    if (cancelled) return;
    try {
      if (ref._type === 'doc') {
        const snap = await getDoc(ref as DocRef);
        if (!cancelled) callback(snap);
      } else {
        const snap = await getDocs(ref as CollectionRef | QueryRef);
        if (!cancelled) callback(snap);
      }
    } catch (err) {
      console.error('[firestore-compat] onSnapshot error:', err);
    }
  };

  // Initial fetch
  fetchAndNotify();

  // Subscribe to data change events for this table
  const unsubEvents = dataEvents.on(table, fetchAndNotify);

  // Return unsubscribe function
  return () => {
    cancelled = true;
    unsubEvents();
  };
}

// ---- Write operations ----

/**
 * addDoc(collectionRef, data) — insert a new document
 */
export async function addDoc(ref: CollectionRef, data: Record<string, unknown>) {
  const writeData = prepareWriteData(data);

  // If this is a subcollection, inject the parent FK
  if (ref._parentId) {
    const sub = Object.values(SUBCOLLECTION_MAP).find(s => s.table === ref._table);
    const fk = sub?.fkColumn || 'project_id';
    writeData[fk] = ref._parentId;
  }

  const result = await sqlDb.insert<Record<string, unknown>>(ref._table, writeData);
  const newId = (result as Record<string, unknown>).id as string || '';
  dataEvents.emit(ref._table);
  return { _type: 'doc' as const, _table: ref._table, _id: newId, id: newId };
}

/**
 * setDoc(docRef, data, options?) — atomic upsert (INSERT or UPDATE).
 * Uses a single SQL statement to avoid TOCTOU race conditions.
 */
export async function setDoc(ref: DocRef, data: Record<string, unknown>, _options?: { merge?: boolean }): Promise<void> {
  const writeData = prepareWriteData(data);
  await sqlDb.upsert(ref._table, ref._id, writeData);
  dataEvents.emit(ref._table);
}

/**
 * updateDoc(docRef, data) — update specific fields.
 * Handles field transform sentinels (arrayUnion, arrayRemove, increment)
 * by reading the existing document first when needed.
 */
export async function updateDoc(ref: DocRef, data: Record<string, unknown>) {
  const hasSentinels = Object.values(data).some(isFieldSentinel);

  let writeData: Record<string, unknown>;

  if (hasSentinels) {
    // Read existing doc to merge sentinel operations
    const existing = await sqlDb.getById<Record<string, unknown>>(ref._table, ref._id);
    writeData = {};
    const existingData = existing as Record<string, unknown> | null;
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (isFieldSentinel(value) && value._type === 'arrayUnion') {
        const currentRaw = existingData ? existingData[key] : null;
        const currentArr = Array.isArray(currentRaw) ? currentRaw
          : (typeof currentRaw === 'string' ? tryParseJson(currentRaw) : []);
        const merged = [...currentArr, ...value.elements];
        writeData[key] = JSON.stringify(merged);
      } else if (isFieldSentinel(value) && value._type === 'arrayRemove') {
        const currentRaw = existingData ? existingData[key] : null;
        const currentArr = Array.isArray(currentRaw) ? currentRaw
          : (typeof currentRaw === 'string' ? tryParseJson(currentRaw) : []);
        const toRemove = new Set(value.elements.map(String));
        const filtered = currentArr.filter((item: unknown) => !toRemove.has(String(item)));
        writeData[key] = JSON.stringify(filtered);
      } else if (isFieldSentinel(value) && value._type === 'increment') {
        const currentVal = existingData ? Number(existingData[key]) || 0 : 0;
        writeData[key] = currentVal + value.value;
      } else {
        // Normal field — run through prepareWriteData for one field
        const prepared = prepareWriteData({ [key]: value });
        Object.assign(writeData, prepared);
      }
    }
  } else {
    writeData = prepareWriteData(data);
  }

  await sqlDb.update(ref._table, ref._id, writeData);
  dataEvents.emit(ref._table);
}

/**
 * deleteDoc(docRef) — delete a document
 */
export async function deleteDoc(ref: DocRef) {
  await sqlDb.remove(ref._table, ref._id);
  dataEvents.emit(ref._table);
}

/**
 * writeBatch() — batch write operations
 */
export function writeBatch(_db?: unknown) {
  const ops: Array<() => Promise<void>> = [];

  return {
    set: (ref: DocRef, data: Record<string, unknown>) => {
      ops.push(async () => { await setDoc(ref, data); });
    },
    update: (ref: DocRef, data: Record<string, unknown>) => {
      ops.push(async () => { await updateDoc(ref, data); });
    },
    delete: (ref: DocRef) => {
      ops.push(async () => { await deleteDoc(ref); });
    },
    commit: async () => {
      for (const op of ops) {
        await op();
      }
    },
  };
}

/**
 * runTransaction(db, callback) — simulate transactions
 */
export async function runTransaction(_db: unknown, callback: (transaction: TransactionLike) => Promise<void>): Promise<void> {
  const transaction: TransactionLike = {
    get: async (ref: DocRef) => getDoc(ref),
    set: async (ref: DocRef, data: Record<string, unknown>) => { await setDoc(ref, data); },
    update: async (ref: DocRef, data: Record<string, unknown>) => { await updateDoc(ref, data); },
    delete: async (ref: DocRef) => { await deleteDoc(ref); },
  };
  await callback(transaction);
}


