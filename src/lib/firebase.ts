/**
 * Firebase compatibility stubs for Tauri/SQLite desktop app.
 * Exports db, auth, storage markers used by 50+ component files.
 * The real work is done by firestore-compat.ts and file-storage.ts.
 */

interface LocalAuth {
  currentUser: {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
  };
}

// The 'db' export is a marker passed to collection()/doc() — the compat layer ignores it
export const db: unknown = Symbol('local-db');

// Auth stub — components that import { auth } just need currentUser
export const auth: LocalAuth = {
  currentUser: {
    uid: 'local-user',
    email: 'local@procureflow.desktop',
    displayName: 'Local User',
    photoURL: null,
  },
};

// Storage stub — file-storage.ts handles actual file operations
export const storage: Record<string, never> = {};

// App stub
export const app: Record<string, never> = {};
