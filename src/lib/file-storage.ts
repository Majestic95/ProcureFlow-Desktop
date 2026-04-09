/**
 * Local file storage layer for Tauri desktop app.
 * Replaces Firebase Storage — files are stored in AppData/Local/ProcureFlow/storage/.
 *
 * Files are referenced by relative paths (e.g., "rfps/abc123/document.pdf").
 * These paths are stored in the database as the "URL" field.
 * To display/download a file, use fileStorage.getObjectUrl() to get a
 * blob URL, or fileStorage.getAbsolutePath() for the OS file path.
 */

import { invoke } from '@tauri-apps/api/core';

export interface StorageMetadata {
  name: string;
  size: number;
  contentType: string;
  path: string;
}

/**
 * Upload a File object to local storage.
 * Returns the relative storage path (used as the "download URL" in the database).
 */
export async function uploadFile(
  folder: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ name: string; url: string }> {
  // Read the file into an ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(arrayBuffer));

  // Generate a unique filename: timestamp-originalname
  const relativePath = `${folder}/${Date.now()}-${file.name}`;

  // Signal start
  onProgress?.(10);

  // Save via Tauri command
  const savedPath = await invoke<string>('file_save', {
    relativePath,
    data,
  });

  // Signal complete
  onProgress?.(100);

  return { name: file.name, url: savedPath };
}

/**
 * Upload raw bytes (e.g., from a generated document).
 */
export async function uploadBytes(
  relativePath: string,
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<string> {
  let bytes: number[];

  if (data instanceof Blob) {
    const buffer = await data.arrayBuffer();
    bytes = Array.from(new Uint8Array(buffer));
  } else if (data instanceof ArrayBuffer) {
    bytes = Array.from(new Uint8Array(data));
  } else {
    bytes = Array.from(data);
  }

  return invoke<string>('file_save', { relativePath, data: bytes });
}

/**
 * Read a file and return it as a Blob.
 */
export async function readFile(relativePath: string): Promise<Blob> {
  const data = await invoke<number[]>('file_read', { relativePath });
  return new Blob([new Uint8Array(data)]);
}

/**
 * Read a file and return a blob: URL for use in <a href> or <img src>.
 * Remember to call URL.revokeObjectURL() when done.
 */
export async function getObjectUrl(relativePath: string): Promise<string> {
  const blob = await readFile(relativePath);
  return URL.createObjectURL(blob);
}

/**
 * Delete a file from local storage.
 */
export async function deleteFile(relativePath: string): Promise<boolean> {
  return invoke<boolean>('file_delete', { relativePath });
}

/**
 * Get file metadata (name, size, content type).
 */
export async function getFileMetadata(relativePath: string): Promise<StorageMetadata | null> {
  return invoke<StorageMetadata | null>('file_metadata', { relativePath });
}

/**
 * List all files in a directory.
 */
export async function listFiles(relativeDir: string): Promise<string[]> {
  return invoke<string[]>('file_list', { relativeDir });
}

// ---- Firebase Storage compatibility wrappers ----
// These mimic the Firebase Storage API for components that haven't been
// fully migrated yet.

/** Mimics Firebase ref() — just returns the path string */
export function ref(_storage: unknown, path: string): string {
  return path;
}

/**
 * Mimics Firebase uploadBytesResumable() — returns an upload task-like object.
 * The upload starts immediately (so `await task` works without calling `.on()`).
 * If `.on()` is called, progress/error/complete callbacks are invoked.
 */
export function uploadBytesResumable(_ref: string, file: File | Blob) {
  let resolveComplete: (value: unknown) => void;
  let rejectComplete: (reason: unknown) => void;
  const completePromise = new Promise((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });

  const totalBytes = file.size;
  let onProgressCb: ((snap: { bytesTransferred: number; totalBytes: number }) => void) | null = null;
  let onErrorCb: ((err: Error) => void) | null = null;
  let onCompleteCb: (() => void) | null = null;

  const task = {
    snapshot: { ref: _ref, bytesTransferred: 0, totalBytes },
    on: (
      _event: string,
      onProgress?: ((snap: { bytesTransferred: number; totalBytes: number }) => void) | null,
      onError?: ((err: Error) => void) | null,
      onComplete?: (() => void) | null,
    ) => {
      if (onProgress) onProgressCb = onProgress;
      if (onError) onErrorCb = onError;
      if (onComplete) onCompleteCb = onComplete;
    },
    then: (cb: (v: unknown) => void, errCb?: (e: unknown) => void) =>
      completePromise.then(cb, errCb),
  };

  // Start upload immediately (not gated on .on() being called)
  (async () => {
    try {
      onProgressCb?.({ bytesTransferred: 0, totalBytes });
      await uploadBytes(_ref, file);
      task.snapshot.bytesTransferred = totalBytes;
      onProgressCb?.({ bytesTransferred: totalBytes, totalBytes });
      onCompleteCb?.();
      resolveComplete!(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onErrorCb?.(error);
      rejectComplete!(error);
    }
  })();

  return task;
}

/** Mimics Firebase getDownloadURL() — returns the relative path (which IS the URL in local storage) */
export async function getDownloadURL(refOrPath: string | { ref: string }): Promise<string> {
  if (typeof refOrPath === 'string') return refOrPath;
  return refOrPath.ref;
}

/** Mimics Firebase deleteObject() */
export async function deleteObject(refPath: string): Promise<void> {
  await deleteFile(refPath);
}

/** Mimics Firebase getMetadata() */
export async function getMetadata(refPath: string): Promise<StorageMetadata> {
  const metadata = await getFileMetadata(refPath);
  return metadata || { name: '', size: 0, contentType: 'application/octet-stream', path: refPath };
}

/** Mimics Firebase getBlob() */
export async function getBlob(refPath: string): Promise<Blob> {
  return readFile(refPath);
}
