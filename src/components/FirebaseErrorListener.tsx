import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/lib/error-emitter';

/**
 * A React component that listens for Firestore permission errors and
 * displays a toast notification when one occurs. In development, this
 * component will also throw the error so that it can be caught by the
 * Next.js error overlay.
 *
 * @returns A React component.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: Error) => {
      // In development, we want to see the error overlay.
      // In production, we want to show a toast notification.
      if (import.meta.env.DEV) {
        // This will be caught by the Vite error overlay.
        setTimeout(() => {
          throw error;
        }, 0);
      } else {
        // In production, show a toast notification.
        toast({
          title: 'Permission Denied',
          description: 'You do not have permission to perform this action.',
          variant: 'destructive',
        });
      }
    };

    errorEmitter.on('permission-error', handlePermissionError);

    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
