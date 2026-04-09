import React, { useState } from 'react';
import type { EquipmentPackage } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const GANTT_COLORS: Record<string, string> = {
  Mechanical: '#0ea5e9', Electrical: '#f59e0b', Civil: '#10b981', Others: '#8b5cf6',
};

export interface ManagePackagesDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  packages: EquipmentPackage[];
  allDisciplines: string[];
  onUpdateDiscipline: (pkgId: string, discipline: string) => void;
  onDeletePackage: (pkgId: string) => void;
  onAddPackage: (name: string, discipline: string) => Promise<void>;
}

export function ManagePackagesDialog({
  open, onOpenChange, packages, allDisciplines,
  onUpdateDiscipline, onDeletePackage, onAddPackage,
}: ManagePackagesDialogProps) {
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgDiscipline, setNewPkgDiscipline] = useState('Mechanical');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newPkgName.trim()) return;
    setSaving(true);
    try {
      await onAddPackage(newPkgName.trim(), newPkgDiscipline);
      setNewPkgName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Packages</DialogTitle>
          <DialogDescription>Add or remove packages from your schedule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 pt-4">
          {/* Existing */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium border-b pb-2">Current Packages ({packages.length})</h3>
            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
              {packages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No packages yet. Add one below.</p>
              ) : packages.map(pkg => (
                <div key={pkg.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 group hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: GANTT_COLORS[pkg.discipline] || '#64748b' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{pkg.name}</p>
                      <Select value={pkg.discipline} onValueChange={(val) => onUpdateDiscipline(pkg.id, val)}>
                        <SelectTrigger className="h-6 w-fit min-w-[100px] text-[9px] uppercase tracking-wider p-1 mt-0.5 bg-transparent border-none hover:bg-muted focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allDisciplines.map(d => <SelectItem key={d} value={d} className="text-[10px]">{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors shrink-0" onClick={() => onDeletePackage(pkg.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          {/* Add new */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium">Add New Package</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Package Name</Label>
                <Input placeholder="e.g., Cooling Towers" value={newPkgName} onChange={e => setNewPkgName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <div className="space-y-2">
                <Label>Discipline</Label>
                <Select value={newPkgDiscipline} onValueChange={setNewPkgDiscipline}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{allDisciplines.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={!newPkgName.trim() || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add to Schedule
            </Button>
          </div>
        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="default" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
