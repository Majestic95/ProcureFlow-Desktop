import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Pin, PinOff, X } from 'lucide-react';

export interface PinnedView {
  id: string;
  tab: string;
  label: string;
  pinnedAt: number;
}

interface ProjectPinsProps {
  projectId: string;
  currentTab: string;
  tabLabels: Record<string, string>;
  onNavigate: (tab: string) => void;
}

function getStorageKey(projectId: string): string {
  return `procureflow_pins_${projectId}`;
}

function loadPins(projectId: string): PinnedView[] {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePins(projectId: string, pins: PinnedView[]): void {
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(pins));
  } catch {
    // Quota exceeded or localStorage unavailable — fail silently
  }
}

export function ProjectPins({ projectId, currentTab, tabLabels, onNavigate }: ProjectPinsProps) {
  const [pins, setPins] = useState<PinnedView[]>([]);

  // Load pins from localStorage on mount
  useEffect(() => {
    setPins(loadPins(projectId));
  }, [projectId]);

  // Sync pins across browser tabs via storage event
  useEffect(() => {
    const key = getStorageKey(projectId);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setPins(loadPins(projectId));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [projectId]);

  const isCurrentTabPinned = pins.some(p => p.tab === currentTab);

  const togglePin = useCallback(() => {
    setPins(prev => {
      let next: PinnedView[];
      if (prev.some(p => p.tab === currentTab)) {
        // Unpin
        next = prev.filter(p => p.tab !== currentTab);
      } else {
        // Pin
        next = [...prev, {
          id: crypto.randomUUID(),
          tab: currentTab,
          label: tabLabels[currentTab] || currentTab,
          pinnedAt: Date.now(),
        }];
      }
      savePins(projectId, next);
      return next;
    });
  }, [currentTab, projectId, tabLabels]);

  const removePin = useCallback((pinId: string) => {
    setPins(prev => {
      const next = prev.filter(p => p.id !== pinId);
      savePins(projectId, next);
      return next;
    });
  }, [projectId]);

  return (
    <div className="flex items-center gap-1.5 min-h-[32px]">
      {/* Pin/Unpin current tab button */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 text-xs gap-1 ${isCurrentTabPinned ? 'text-primary' : 'text-muted-foreground'}`}
        onClick={togglePin}
        title={isCurrentTabPinned ? 'Unpin this tab' : 'Pin this tab for quick access'}
      >
        {isCurrentTabPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        {isCurrentTabPinned ? 'Unpin' : 'Pin'}
      </Button>

      {/* Pinned view chips */}
      {pins.length > 0 && (
        <div className="flex items-center gap-1 ml-1 border-l pl-2 border-border/50">
          {pins.map(pin => (
            <div
              key={pin.id}
              className={`
                flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer
                transition-colors border
                ${pin.tab === currentTab
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground'}
              `}
              onClick={() => onNavigate(pin.tab)}
            >
              <Pin className="h-2.5 w-2.5" />
              {pin.label}
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
    </div>
  );
}
