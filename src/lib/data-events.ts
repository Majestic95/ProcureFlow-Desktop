/**
 * Simple event bus for data change notifications.
 *
 * When a component writes data (insert/update/delete), it emits an event
 * for the affected table. Components with active onSnapshot listeners on
 * that table will re-fetch and update their UI.
 *
 * This replaces Firestore's real-time listener behavior in the local
 * SQLite context. Single-user desktop apps don't have concurrent writers,
 * but components still need to react to their own writes and writes from
 * other components on the same page.
 *
 * Usage:
 *   // After a write:
 *   dataEvents.emit('projects');
 *
 *   // Listening (done automatically by firestore-compat onSnapshot):
 *   const unsub = dataEvents.on('projects', () => refetch());
 */

type Listener = () => void;

class DataEventBus {
  private listeners = new Map<string, Set<Listener>>();

  /** Subscribe to changes on a table */
  on(table: string, listener: Listener): () => void {
    if (!this.listeners.has(table)) {
      this.listeners.set(table, new Set());
    }
    this.listeners.get(table)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(table)?.delete(listener);
    };
  }

  /** Emit a change event for a table */
  emit(table: string) {
    const tableListeners = this.listeners.get(table);
    if (tableListeners) {
      for (const listener of tableListeners) {
        // Use setTimeout to avoid sync re-render issues
        setTimeout(listener, 0);
      }
    }
  }

  /** Emit change events for multiple tables */
  emitMany(tables: string[]) {
    for (const table of tables) {
      this.emit(table);
    }
  }
}

export const dataEvents = new DataEventBus();
