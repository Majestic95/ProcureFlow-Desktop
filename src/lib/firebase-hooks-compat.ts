/**
 * Compatibility layer for react-firebase-hooks/firestore.
 * Provides useCollection and useDocument hooks backed by local SQLite.
 * Uses the data event bus for reactivity — re-fetches when data changes.
 */

import { useState, useEffect, useCallback } from 'react';
import { getDocs, getDoc } from '@/lib/firestore-compat';
import type { CollectionRef, QueryRef, DocRef } from '@/lib/firestore-compat';
import { dataEvents } from '@/lib/data-events';

type DocSnap = Awaited<ReturnType<typeof getDoc>>;
type QuerySnap = Awaited<ReturnType<typeof getDocs>>;

/**
 * useCollection(queryOrCollectionRef) — fetches data on mount and
 * re-fetches when the underlying table changes.
 */
export function useCollection(
  ref: CollectionRef | QueryRef | null | undefined,
): [QuerySnap | undefined, boolean, Error | undefined] {
  const [data, setData] = useState<QuerySnap | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  const refKey = ref ? JSON.stringify(ref) : 'null';
  const table = ref?._table;

  const fetchData = useCallback(async () => {
    if (!ref) return;
    try {
      const snap = await getDocs(ref);
      setData(snap);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [refKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchData();

    // Subscribe to data changes for this table
    if (table) {
      return dataEvents.on(table, fetchData);
    }
  }, [refKey, table, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  return [data, loading, error];
}

/**
 * useDocument(docRef) — fetches a single document and re-fetches on changes.
 */
export function useDocument(
  ref: DocRef | null | undefined,
): [DocSnap | undefined, boolean, Error | undefined] {
  const [data, setData] = useState<DocSnap | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  const refKey = ref ? `${ref._table}/${ref._id}` : 'null';
  const table = ref?._table;

  const fetchData = useCallback(async () => {
    if (!ref) return;
    try {
      const snap = await getDoc(ref);
      setData(snap);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [refKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchData();

    // Subscribe to data changes for this table
    if (table) {
      return dataEvents.on(table, fetchData);
    }
  }, [refKey, table, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  return [data, loading, error];
}
