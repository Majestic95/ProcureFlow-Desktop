import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Pin, PinOff, X } from 'lucide-react';

interface PinnedPage {
  id: string;
  path: string;
  label: string;
  pinnedAt: number;
}

const STORAGE_KEY = 'procureflow_global_pins';

/**
 * Derive a human-readable label for the current page.
 * Reads the page's h1 heading for context (e.g., project name),
 * then appends the active tab if visible.
 */
function capturePageLabel(path: string): string {
  // Try to read the h1 heading for entity name (e.g., "Beta Development")
  const h1 = document.querySelector('h1');
  const heading = h1?.textContent?.trim() || '';

  // Try to find active tab
  const activeTab = document.querySelector('[data-state="active"][role="tab"]');
  const tabLabel = activeTab?.textContent?.trim() || '';

  // Known route segments for fallback
  const routeLabels: Record<string, string> = {
    projects: 'Projects', rfps: 'RFPs', proposals: 'Proposals',
    suppliers: 'Suppliers', clients: 'Clients', templates: 'Templates',
    coverage: 'Coverage Map', settings: 'Settings', schedules: 'Schedules',
    test: 'Dev Tools', help: 'Help',
  };

  const segments = path.replace('/dashboard', '').split('/').filter(Boolean);

  // If we have a heading and tab, use: "Heading — Tab"
  if (heading && tabLabel) return `${heading} — ${tabLabel}`;
  if (heading) return heading;

  // Fallback: build from URL segments
  const parts: string[] = [];
  for (const seg of segments) {
    if (routeLabels[seg]) parts.push(routeLabels[seg]);
    else if (seg === 'new') parts.push('New');
    else if (seg === 'edit') parts.push('Edit');
    else if (seg === 'audit') parts.push('Audit Trail');
    else if (seg.length > 10) parts.push(seg.slice(0, 6) + '…');
    else parts.push(seg.charAt(0).toUpperCase() + seg.slice(1));
  }
  return parts.join(' › ') || 'Dashboard';
}

function loadPins(): PinnedPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePins(pins: PinnedPage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // Quota exceeded — fail silently
  }
}

export function GlobalPinBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [pins, setPins] = useState<PinnedPage[]>([]);

  useEffect(() => {
    setPins(loadPins());
  }, []);

  // Sync across browser tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPins(loadPins());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Full path includes hash for tab state (e.g., /dashboard/projects/abc#schedule)
  const fullPath = typeof window !== 'undefined' ? pathname + window.location.hash : pathname;
  const isCurrentPinned = pins.some(p => p.path === fullPath || p.path === pathname);

  const togglePin = useCallback(() => {
    const currentPath = pathname + (typeof window !== 'undefined' ? window.location.hash : '');
    setPins(prev => {
      let next: PinnedPage[];
      // Match on full path or base path
      if (prev.some(p => p.path === currentPath || p.path === pathname)) {
        next = prev.filter(p => p.path !== currentPath && p.path !== pathname);
      } else {
        next = [...prev, {
          id: crypto.randomUUID(),
          path: currentPath,
          label: capturePageLabel(pathname),
          pinnedAt: Date.now(),
        }];
      }
      savePins(next);
      return next;
    });
  }, [pathname]);

  const removePin = useCallback((pinId: string) => {
    setPins(prev => {
      const next = prev.filter(p => p.id !== pinId);
      savePins(next);
      return next;
    });
  }, []);

  return (
    <div className="sticky bottom-0 z-30 border-t bg-card/95 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 px-4 py-1.5 overflow-x-auto">
        {/* Pin/Unpin current page */}
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1 flex-shrink-0 ${isCurrentPinned ? 'text-primary' : 'text-muted-foreground'}`}
          onClick={togglePin}
          title={isCurrentPinned ? 'Unpin this page' : 'Pin this page'}
        >
          {isCurrentPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {isCurrentPinned ? 'Unpin' : 'Pin Page'}
        </Button>

        {/* Pinned page chips */}
        {pins.length > 0 && (
          <div className="flex items-center gap-1 border-l pl-2 border-border/50">
            {pins.map(pin => (
              <div
                key={pin.id}
                className={`
                  flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-medium cursor-pointer
                  transition-colors border flex-shrink-0
                  ${pin.path === pathname
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground'}
                `}
                onClick={() => {
                  const hashIdx = pin.path.indexOf('#');
                  if (hashIdx >= 0) {
                    navigate(pin.path.substring(0, hashIdx));
                    setTimeout(() => { window.location.hash = pin.path.substring(hashIdx); }, 100);
                  } else {
                    navigate(pin.path);
                  }
                }}
              >
                <Pin className="h-2.5 w-2.5" />
                <span className="truncate max-w-[200px]" title={pin.label}>{pin.label}</span>
                <button
                  className="ml-0.5 hover:text-destructive transition-colors"
                  onClick={(e) => { e.stopPropagation(); removePin(pin.id); }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {pins.length === 0 && (
          <span className="text-[10px] text-muted-foreground/50 ml-2">Pin pages for quick access</span>
        )}
      </div>
    </div>
  );
}
