/**
 * Local SQLite data access layer via Tauri invoke commands.
 * Replaces all Firebase Firestore operations.
 *
 * Returns data in the same shape the components expect,
 * with ISO date strings (compatible with ensureDate()).
 */

import { invoke } from '@tauri-apps/api/core';

// ---- Case conversion utilities ----
// SQLite uses snake_case columns, TypeScript uses camelCase properties.

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Convert top-level keys from snake_case to camelCase (shallow).
 * Does NOT recurse into nested objects/arrays — those are JSON blobs from
 * SQLite that should preserve their original key names (domain data).
 * Only the SQL column names (top-level keys) need conversion.
 */
function toCamelCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => toCamelCase(item)) as T;
  if (typeof obj !== 'object') return obj as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[snakeToCamel(key)] = value; // shallow — don't recurse
  }
  return result as T;
}

/** Convert all keys in an object from camelCase to snake_case (shallow — for SQL writes) */
function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

// ---- Generic CRUD ----

async function getAll<T>(
  table: string,
  filterCol?: string,
  filterVal?: string,
  orderBy?: string,
): Promise<T[]> {
  const rows = await invoke<unknown[]>('db_get_all', {
    table,
    filterCol: filterCol ?? null,
    filterVal: filterVal ?? null,
    orderBy: orderBy ?? null,
  });
  return rows.map((row) => toCamelCase<T>(row));
}

async function getById<T>(table: string, id: string): Promise<T | null> {
  const row = await invoke<unknown | null>('db_get_by_id', { table, id });
  return row ? toCamelCase<T>(row) : null;
}

async function insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
  const snakeData = toSnakeCase(data);
  const row = await invoke<unknown>('db_insert', { table, data: snakeData });
  return toCamelCase<T>(row);
}

async function update<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
  const snakeData = toSnakeCase(data);
  const row = await invoke<unknown>('db_update', { table, id, data: snakeData });
  return toCamelCase<T>(row);
}

async function remove(table: string, id: string): Promise<boolean> {
  return invoke<boolean>('db_delete', { table, id });
}

async function upsert<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
  const snakeData = toSnakeCase(data);
  const row = await invoke<unknown>('db_upsert', { table, id, data: snakeData });
  return toCamelCase<T>(row);
}

async function query<T>(sql: string, params?: string[]): Promise<T[]> {
  const rows = await invoke<unknown[]>('db_query', { sql, paramsJson: params ?? null });
  return rows.map((row) => toCamelCase<T>(row));
}

async function execute(sql: string, params?: string[]): Promise<number> {
  return invoke<number>('db_execute', { sql, paramsJson: params ?? null });
}

// ---- Entity-specific helpers ----
// These match the Firestore patterns used throughout the app.

export const db = {
  // Raw operations
  getAll,
  getById,
  insert,
  update,
  remove,
  upsert,
  query,
  execute,

  // Clients
  clients: {
    getAll: () => getAll('clients', undefined, undefined, 'name ASC'),
    getById: (id: string) => getById('clients', id),
    create: (data: Record<string, unknown>) => insert('clients', data),
    update: (id: string, data: Record<string, unknown>) => update('clients', id, data),
    delete: (id: string) => remove('clients', id),
  },

  // Projects
  projects: {
    getAll: () => getAll('projects', undefined, undefined, 'created_at DESC'),
    getById: (id: string) => getById('projects', id),
    create: (data: Record<string, unknown>) => insert('projects', data),
    update: (id: string, data: Record<string, unknown>) => update('projects', id, data),
    delete: (id: string) => remove('projects', id),
  },

  // Suppliers
  suppliers: {
    getAll: () => getAll('suppliers', undefined, undefined, 'company_name ASC'),
    getById: (id: string) => getById('suppliers', id),
    create: (data: Record<string, unknown>) => insert('suppliers', data),
    update: (id: string, data: Record<string, unknown>) => update('suppliers', id, data),
    delete: (id: string) => remove('suppliers', id),
  },

  // RFPs
  rfps: {
    getAll: () => getAll('rfps', undefined, undefined, 'created_at DESC'),
    getByProject: (projectId: string) => getAll('rfps', 'project_id', projectId, 'created_at DESC'),
    getById: (id: string) => getById('rfps', id),
    create: (data: Record<string, unknown>) => insert('rfps', data),
    update: (id: string, data: Record<string, unknown>) => update('rfps', id, data),
    delete: (id: string) => remove('rfps', id),
  },

  // Proposals
  proposals: {
    getAll: () => getAll('proposals', undefined, undefined, 'submitted_at DESC'),
    getByRfp: (rfpId: string) => getAll('proposals', 'rfp_id', rfpId),
    getById: (id: string) => getById('proposals', id),
    create: (data: Record<string, unknown>) => insert('proposals', data),
    update: (id: string, data: Record<string, unknown>) => update('proposals', id, data),
    delete: (id: string) => remove('proposals', id),
  },

  // Packages (project subcollection)
  packages: {
    getByProject: (projectId: string) => getAll('packages', 'project_id', projectId),
    getById: (id: string) => getById('packages', id),
    create: (data: Record<string, unknown>) => insert('packages', data),
    update: (id: string, data: Record<string, unknown>) => update('packages', id, data),
    delete: (id: string) => remove('packages', id),
  },

  // Change Orders
  changeOrders: {
    getByProject: (projectId: string) => getAll('change_orders', 'project_id', projectId, 'created_at DESC'),
    getById: (id: string) => getById('change_orders', id),
    create: (data: Record<string, unknown>) => insert('change_orders', data),
    update: (id: string, data: Record<string, unknown>) => update('change_orders', id, data),
    delete: (id: string) => remove('change_orders', id),
  },

  // Risks
  risks: {
    getByProject: (projectId: string) => getAll('risks', 'project_id', projectId),
    getById: (id: string) => getById('risks', id),
    create: (data: Record<string, unknown>) => insert('risks', data),
    update: (id: string, data: Record<string, unknown>) => update('risks', id, data),
    delete: (id: string) => remove('risks', id),
  },

  // Todos
  todos: {
    getByProject: (projectId: string) => getAll('todos', 'project_id', projectId, 'created_at DESC'),
    getById: (id: string) => getById('todos', id),
    create: (data: Record<string, unknown>) => insert('todos', data),
    update: (id: string, data: Record<string, unknown>) => update('todos', id, data),
    delete: (id: string) => remove('todos', id),
  },

  // Deliveries
  deliveries: {
    getByProject: (projectId: string) => getAll('deliveries', 'project_id', projectId),
    getById: (id: string) => getById('deliveries', id),
    create: (data: Record<string, unknown>) => insert('deliveries', data),
    update: (id: string, data: Record<string, unknown>) => update('deliveries', id, data),
    delete: (id: string) => remove('deliveries', id),
  },

  // Contracts
  contracts: {
    getByProject: (projectId: string) => getAll('contracts', 'project_id', projectId),
    getById: (id: string) => getById('contracts', id),
    create: (data: Record<string, unknown>) => insert('contracts', data),
    update: (id: string, data: Record<string, unknown>) => update('contracts', id, data),
    delete: (id: string) => remove('contracts', id),
  },

  // Questions (Q&A / RFI)
  questions: {
    getByProject: (projectId: string) => getAll('questions', 'project_id', projectId, 'idx ASC'),
    getById: (id: string) => getById('questions', id),
    create: (data: Record<string, unknown>) => insert('questions', data),
    update: (id: string, data: Record<string, unknown>) => update('questions', id, data),
    delete: (id: string) => remove('questions', id),
  },

  // Notes (universal, any entity)
  notes: {
    getByEntity: (entityType: string, entityId: string) =>
      query('SELECT * FROM notes WHERE entity_type = ?1 AND entity_id = ?2 ORDER BY pinned DESC, created_at DESC', [entityType, entityId]),
    getPinned: () =>
      query('SELECT * FROM notes WHERE pinned = 1 ORDER BY updated_at DESC'),
    getById: (id: string) => getById('notes', id),
    create: (data: Record<string, unknown>) => insert('notes', data),
    update: (id: string, data: Record<string, unknown>) => update('notes', id, data),
    delete: (id: string) => remove('notes', id),
  },

  // Schedules (legacy)
  schedules: {
    getAll: () => getAll('schedules', undefined, undefined, 'created_at DESC'),
    getById: (id: string) => getById('schedules', id),
    create: (data: Record<string, unknown>) => insert('schedules', data),
    update: (id: string, data: Record<string, unknown>) => update('schedules', id, data),
    delete: (id: string) => remove('schedules', id),
  },

  // Schedule Packages
  schedulePackages: {
    getBySchedule: (scheduleId: string) => getAll('schedule_packages', 'schedule_id', scheduleId),
    create: (data: Record<string, unknown>) => insert('schedule_packages', data),
    update: (id: string, data: Record<string, unknown>) => update('schedule_packages', id, data),
    delete: (id: string) => remove('schedule_packages', id),
  },

  // Templates
  templates: {
    getAll: () => getAll('templates', undefined, undefined, 'name ASC'),
    getById: (id: string) => getById('templates', id),
    create: (data: Record<string, unknown>) => insert('templates', data),
    update: (id: string, data: Record<string, unknown>) => update('templates', id, data),
    delete: (id: string) => remove('templates', id),
  },

  // Audit Logs
  audit: {
    getAll: (limit?: number) =>
      limit
        ? query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?1', [String(limit)])
        : query('SELECT * FROM audit_logs ORDER BY timestamp DESC'),
    log: (data: Record<string, unknown>) => insert('audit_logs', data),
  },

  // Users
  users: {
    getAll: () => getAll('users'),
    getByEmail: (email: string) => getAll('users', 'email', email),
    getById: (id: string) => getById('users', id),
    create: (data: Record<string, unknown>) => insert('users', data),
    update: (id: string, data: Record<string, unknown>) => update('users', id, data),
    delete: (id: string) => remove('users', id),
  },

  // App Config (key-value store)
  config: {
    get: async (key: string): Promise<string | null> => {
      const rows = await getAll<{ key: string; value: string }>('app_config', 'key', key);
      return rows[0]?.value ?? null;
    },
    set: async (key: string, value: string): Promise<void> => {
      await execute(
        'INSERT INTO app_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2',
        [key, value],
      );
    },
  },
};
