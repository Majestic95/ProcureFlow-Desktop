import { useState, useEffect } from 'react';
import { CHANGELOG, getLatestVersion, type ChangelogEntry } from '@/lib/changelog-data';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bug, Shield, FileText } from 'lucide-react';

const STORAGE_KEY = 'procureflow_changelog_seen';

const TYPE_CONFIG: Record<ChangelogEntry['type'], { icon: typeof Sparkles; color: string; label: string }> = {
  feature: { icon: Sparkles, color: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-100', label: 'Feature' },
  fix: { icon: Bug, color: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100', label: 'Fix' },
  security: { icon: Shield, color: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100', label: 'Security' },
  docs: { icon: FileText, color: 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100', label: 'Docs' },
};

function hasNewChanges(): boolean {
  try {
    const seen = localStorage.getItem(STORAGE_KEY);
    return seen !== getLatestVersion();
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, getLatestVersion());
  } catch {
    // quota exceeded
  }
}

export function ChangelogModal() {
  const [open, setOpen] = useState(false);

  // Only show in non-production
  const isProduction = import.meta.env.VITE_FIREBASE_PROJECT_ID === 'production-project';

  // Auto-open on first load if there are new changes
  useEffect(() => {
    if (!isProduction && hasNewChanges()) {
      setOpen(true);
    }
  }, [isProduction]);

  if (isProduction) return null;

  const handleDismiss = () => {
    markSeen();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); else setOpen(true); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            What&apos;s New in ProcureFlow
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh] overflow-y-auto pr-4">
          <div className="space-y-6 pb-4">
            {CHANGELOG.map((entry) => {
              const config = TYPE_CONFIG[entry.type];
              const Icon = config.icon;
              return (
                <div key={entry.version} className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={`${config.color} text-xs`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    <span className="text-sm font-semibold">{entry.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{entry.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                  <ul className="space-y-1 ml-4">
                    {entry.highlights.map((h, i) => (
                      <li key={i} className="text-xs text-foreground/80 list-disc">{h}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={handleDismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Button to manually open the changelog (for header) */
export function ChangelogButton() {
  const [open, setOpen] = useState(false);
  const isProduction = import.meta.env.VITE_FIREBASE_PROJECT_ID === 'production-project';

  if (isProduction) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-[10px] gap-1 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3 w-3" />
        What&apos;s New
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-primary" />
              What&apos;s New in ProcureFlow
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[60vh] overflow-y-auto pr-4">
            <div className="space-y-6 pb-4">
              {CHANGELOG.map((entry) => {
                const config = TYPE_CONFIG[entry.type];
                const Icon = config.icon;
                return (
                  <div key={entry.version} className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`${config.color} text-xs`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <span className="text-sm font-semibold">{entry.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{entry.date}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                    <ul className="space-y-1 ml-4">
                      {entry.highlights.map((h, i) => (
                        <li key={i} className="text-xs text-foreground/80 list-disc">{h}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
