import React, { useState, useEffect } from 'react';
import { MILESTONE_KEYS } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Play, FileSearch, Gavel, Microscope, FileOutput, FileSignature, PackageCheck,
  UserCheck, PenLine, Receipt, Upload, Ruler, Factory, Truck, Flag, CheckCircle,
  Clock, Calendar, Star, Zap, Target, ClipboardCheck, Settings2,
  Ship, Plane, Box, ShoppingCart, Wallet, CreditCard, TrendingUp, AlertCircle,
  Info, HelpCircle, Lightbulb, Database, Cpu, Layers as LayersIcon, HardDrive,
  MoveUp, MoveDown, Trash2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants (duplicated subset needed by these components)
// ---------------------------------------------------------------------------

const ICON_LIBRARY: Record<string, any> = {
  Play, FileSearch, Gavel, Microscope, FileOutput, FileSignature, PackageCheck,
  UserCheck, PenLine, Receipt, Upload, Ruler, Factory, Truck, Flag, CheckCircle,
  Clock, Calendar, Star, Zap, Target, ClipboardCheck, Settings2,
  Ship, Plane, Box, ShoppingCart, Wallet, CreditCard, TrendingUp, AlertCircle,
  Info, HelpCircle, Lightbulb, Database, Cpu, HardDrive, Layers: LayersIcon,
};

const MILESTONE_ICONS_MAP: Record<string, string> = {
  projectStart: 'Play', prePurchaseSpec: 'FileSearch', biddingPeriod: 'Gavel',
  analysisPeriod: 'BarChart3', techReviewPeriod: 'Microscope', loiReleasePeriod: 'FileOutput',
  contractPeriod: 'FileSignature', procurementRecProcess: 'PackageCheck', vendorSelection: 'UserCheck',
  timeToSign: 'PenLine', poIssue: 'Receipt', submittalPeriod: 'Upload',
  shopDrawingReview: 'Ruler', production: 'Factory', delivery: 'Truck',
};

// ---------------------------------------------------------------------------
// IconPicker
// ---------------------------------------------------------------------------

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2 border rounded-lg p-2 max-h-48 overflow-y-auto bg-muted/20">
      {Object.entries(ICON_LIBRARY).map(([name, Icon]) => (
        <Button key={name} variant={value === name ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => onChange(name)} title={name}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManageMilestonesDialog
// ---------------------------------------------------------------------------

export interface ManageMilestonesDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  milestoneKeys: string[];
  milestoneLabels: Record<string, string>;
  milestoneIcons: Record<string, string>;
  onSave: (order: string[], labels: Record<string, string>, icons: Record<string, string>) => void;
  onDelete: (key: string) => void;
}

export function ManageMilestonesDialog({ open, onOpenChange, milestoneKeys, milestoneLabels, milestoneIcons, onSave, onDelete }: ManageMilestonesDialogProps) {
  const [localKeys, setLocalKeys] = useState([...milestoneKeys]);
  const [localLabels, setLocalLabels] = useState({ ...milestoneLabels });
  const [localIcons, setLocalIcons] = useState({ ...milestoneIcons });

  useEffect(() => {
    if (open) { setLocalKeys([...milestoneKeys]); setLocalLabels({ ...milestoneLabels }); setLocalIcons({ ...milestoneIcons }); }
  }, [open, milestoneKeys, milestoneLabels, milestoneIcons]);

  const move = (index: number, direction: 'up' | 'down') => {
    const next = [...localKeys];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setLocalKeys(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Milestones & Sequence</DialogTitle>
          <DialogDescription>Reorder milestones and customize icons/labels.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2 py-4">
          {localKeys.map((key, idx) => {
            const iconName = localIcons[key] || MILESTONE_ICONS_MAP[key] || 'Play';
            const Icon = ICON_LIBRARY[iconName] || Play;
            const isDefault = (MILESTONE_KEYS as readonly string[]).includes(key);
            return (
              <div key={key} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30 group">
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 'up')} disabled={idx === 0}><MoveUp className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 'down')} disabled={idx === localKeys.length - 1}><MoveDown className="h-3 w-3" /></Button>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><Icon className="h-5 w-5" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2">
                    <IconPicker value={localIcons[key] || 'Play'} onChange={(v) => setLocalIcons(prev => ({ ...prev, [key]: v }))} />
                  </PopoverContent>
                </Popover>
                <div className="flex-1 space-y-1">
                  <Input value={localLabels[key] || ''} onChange={e => setLocalLabels(prev => ({ ...prev, [key]: e.target.value }))} className="h-8 text-xs font-semibold" />
                  <p className="text-[10px] text-muted-foreground ml-1">{key}</p>
                </div>
                {!isDefault && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(localKeys, localLabels, localIcons); onOpenChange(false); }}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
