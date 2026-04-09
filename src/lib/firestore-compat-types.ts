/**
 * Type definitions for the Firestore compatibility layer.
 * Extracted to keep firestore-compat.ts under the 500-line cap.
 */

// ---- Reference types ----

export interface CollectionRef {
  _type: 'collection';
  _table: string;
  _parentId?: string;
  _parentTable?: string;
}

export interface DocRef {
  _type: 'doc';
  _table: string;
  _id: string;
  id: string;
}

export interface QueryRef {
  _type: 'query';
  _table: string;
  _filters: Array<{ field: string; op: string; value: unknown }>;
  _orderBy?: { field: string; direction: string };
  _limit?: number;
  _parentId?: string;
  _parentTable?: string;
}

// ---- Constraint types (returned by where/orderBy/limit) ----

export interface WhereConstraint {
  _constraintType: 'where';
  _field: string;
  _op: string;
  _value: unknown;
}

export interface OrderByConstraint {
  _constraintType: 'orderBy';
  _field: string;
  _direction: string;
}

export interface LimitConstraint {
  _constraintType: 'limit';
  _value: number;
}

export interface StartAfterConstraint {
  _constraintType: 'startAfter';
}

export type QueryConstraint = WhereConstraint | OrderByConstraint | LimitConstraint | StartAfterConstraint;

// ---- Field transform sentinels ----

export interface ArrayUnionSentinel {
  _type: 'arrayUnion';
  elements: unknown[];
}

export interface ArrayRemoveSentinel {
  _type: 'arrayRemove';
  elements: unknown[];
}

export interface IncrementSentinel {
  _type: 'increment';
  value: number;
}

export interface DeleteFieldSentinel {
  _type: 'deleteField';
}

export type FieldSentinel =
  | ArrayUnionSentinel
  | ArrayRemoveSentinel
  | IncrementSentinel
  | DeleteFieldSentinel;

export function isFieldSentinel(v: unknown): v is FieldSentinel {
  return typeof v === 'object' && v !== null && '_type' in v
    && ['arrayUnion', 'arrayRemove', 'increment', 'deleteField'].includes((v as FieldSentinel)._type);
}

// ---- Snapshot types ----

export interface DocumentSnapshotLike {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
  ref: DocRef;
}

export interface QuerySnapshotLike {
  docs: DocumentSnapshotLike[];
  empty: boolean;
  size: number;
  forEach: (cb: (doc: DocumentSnapshotLike) => void) => void;
}

// ---- Transaction interface ----

export interface TransactionLike {
  get: (ref: DocRef) => Promise<DocumentSnapshotLike>;
  set: (ref: DocRef, data: Record<string, unknown>) => Promise<void>;
  update: (ref: DocRef, data: Record<string, unknown>) => Promise<void>;
  delete: (ref: DocRef) => Promise<void>;
}

// ---- Exported type aliases (match Firestore SDK type names) ----

export type FieldValue = FieldSentinel | string | number | boolean | null;
export type DocumentData = Record<string, unknown>;
export type DocumentReference = DocRef;
export type CollectionReference = CollectionRef;
export type Query = QueryRef;
export type DocumentSnapshot = DocumentSnapshotLike;
export type QuerySnapshot = QuerySnapshotLike;

// ---- Timestamp class ----

export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }

  static now(): Timestamp {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  static fromDate(date: Date): Timestamp {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
}
