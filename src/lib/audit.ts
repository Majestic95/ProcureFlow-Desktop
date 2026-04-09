import { db } from '@/lib/db';

export type AuditCategory = 'rfp' | 'proposal' | 'user' | 'supplier' | 'schedule' | 'template' | 'client' | 'portal' | 'note' | 'project';

export interface AuditEntry {
  action: string;
  category: AuditCategory;
  targetCollection: string;
  targetDocId: string;
  clientId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Write an audit log entry to local SQLite.
 * Call this alongside any write operation that should be tracked.
 * Failures are logged to console but never block the calling operation.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    // Strip undefined values
    const cleanDetails = entry.details
      ? Object.fromEntries(Object.entries(entry.details).filter(([, v]) => v !== undefined))
      : undefined;

    await db.audit.log({
      action: entry.action,
      category: entry.category,
      targetCollection: entry.targetCollection,
      targetDocId: entry.targetDocId,
      ...(entry.clientId != null && { clientId: entry.clientId }),
      ...(cleanDetails && Object.keys(cleanDetails).length > 0 && { details: JSON.stringify(cleanDetails) }),
      userName: 'Local User',
      userEmail: 'local@procureflow.desktop',
    });
  } catch (error) {
    console.error('[audit] Failed to write audit log:', error);
  }
}
