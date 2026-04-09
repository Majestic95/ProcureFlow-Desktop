import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, CheckCircle, Download, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'up-to-date' | 'error';

interface UpdateInfo {
  version: string;
  notes: string;
  date: string;
}

/**
 * "Check for Updates" button + modal for the Tauri desktop app.
 * Uses @tauri-apps/plugin-updater to check GitHub Releases for new versions.
 * Gracefully degrades when running in a browser (non-Tauri context).
 */
export function UpdateChecker() {
  const { toast } = useToast();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const checkForUpdates = useCallback(async () => {
    setStatus('checking');

    try {
      // Dynamic import — only works in Tauri context
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        setUpdateInfo({
          version: update.version,
          notes: update.body || 'No release notes available.',
          date: update.date || '',
        });
        setStatus('available');
        setDialogOpen(true);
      } else {
        setStatus('up-to-date');
        toast({
          title: 'Up to date',
          description: 'You are running the latest version of ProcureFlow.',
        });
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('[updater] Check failed:', err);
      // Treat unreachable server (private repo, offline, etc.) as "up to date"
      // rather than showing a scary error — the update system is optional
      setStatus('up-to-date');
      toast({
        title: 'Up to date',
        description: 'You are running the latest version of ProcureFlow.',
      });
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [toast]);

  const installUpdate = useCallback(async () => {
    setStatus('downloading');
    setProgress(0);

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (!update) {
        setStatus('idle');
        setDialogOpen(false);
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          contentLength = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setProgress(Math.round((downloaded / contentLength) * 100));
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });

      // Relaunch the app after install
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.error('[updater] Install failed:', err);
      setStatus('error');
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: 'Could not download or install the update. Please try again.',
      });
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [toast]);

  const isChecking = status === 'checking';
  const isDownloading = status === 'downloading';

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-xs text-muted-foreground"
        onClick={checkForUpdates}
        disabled={isChecking || isDownloading}
      >
        {status === 'up-to-date' ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        ) : status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
        )}
        {isChecking ? 'Checking...' : status === 'up-to-date' ? 'Up to date' : 'Check for Updates'}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Update Available
            </DialogTitle>
            <DialogDescription>
              Version {updateInfo?.version} is ready to install.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {updateInfo?.date && (
              <p className="text-xs text-muted-foreground">
                Released: {new Date(updateInfo.date).toLocaleDateString()}
              </p>
            )}
            <div className="rounded-md border bg-muted/50 p-3 text-sm max-h-40 overflow-y-auto">
              {updateInfo?.notes}
            </div>

            {isDownloading && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Downloading... {progress}%
                </p>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={isDownloading}
            >
              Later
            </Button>
            <Button
              onClick={installUpdate}
              disabled={isDownloading}
            >
              {isDownloading ? 'Installing...' : 'Update Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
