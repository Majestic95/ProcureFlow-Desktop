import React from 'react';
import type { EquipmentPackage } from '@/types';
import { MILESTONE_KEYS } from '@/types';
import { exportToExcel } from '@/lib/schedule-import-export';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2, Table2, BarChart3, Plus, Trash2, Filter, X, Search,
  Settings2, Download, UploadCloud, Columns, Calendar, RotateCcw,
} from 'lucide-react';

const DATE_TYPE_COLORS = { planned: '#3b82f6', forecast: '#93c5fd', actual: '#ec4899' } as const;

export interface ScheduleToolbarProps {
  // Date types
  activeDateTypes: Set<'planned' | 'forecast' | 'actual'>;
  onToggleDateType: (dt: 'planned' | 'forecast' | 'actual') => void;
  // Milestone filter
  milestoneFilterOpen: boolean;
  onMilestoneFilterOpenChange: (open: boolean) => void;
  milestoneKeys: string[];
  visibleMilestones: Set<string>;
  onSetVisibleMilestones: (fn: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  milestoneLabels: Record<string, string>;
  onDeleteMilestone: (key: string) => void;
  onOpenAddMilestone: () => void;
  // View
  view: 'table' | 'gantt';
  onSetView: (v: 'table' | 'gantt') => void;
  showExtraColumns: boolean;
  onToggleExtraColumns: () => void;
  // Search
  searchTerm: string;
  onSearchChange: (v: string) => void;
  // Excel
  packages: EquipmentPackage[];
  projectName: string;
  filteredMilestoneKeys: string[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Settings
  onOpenManageMilestones: () => void;
  canEdit: boolean;
  onOpenManagePackages: () => void;
  // Saving
  saving: boolean;
  // Reset
  onResetAllDates?: () => void;
}

export function ScheduleToolbar({
  activeDateTypes, onToggleDateType,
  milestoneFilterOpen, onMilestoneFilterOpenChange,
  milestoneKeys, visibleMilestones, onSetVisibleMilestones,
  milestoneLabels, onDeleteMilestone, onOpenAddMilestone,
  view, onSetView, showExtraColumns, onToggleExtraColumns,
  searchTerm, onSearchChange,
  packages, projectName, filteredMilestoneKeys, fileInputRef, onImport,
  onOpenManageMilestones, canEdit, onOpenManagePackages,
  saving, onResetAllDates,
}: ScheduleToolbarProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Date type toggles */}
        <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
          {(['planned', 'forecast', 'actual'] as const).map(dt => (
            <Button key={dt} variant={activeDateTypes.has(dt) ? 'default' : 'ghost'} size="sm" className="h-7 text-xs capitalize" onClick={() => onToggleDateType(dt)}>
              <div className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: DATE_TYPE_COLORS[dt] }} />{dt}
            </Button>
          ))}
        </div>

        {/* Milestone filter popover */}
        <Popover open={milestoneFilterOpen} onOpenChange={onMilestoneFilterOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-1.5 h-3.5 w-3.5" /> Milestones{' '}
              {visibleMilestones.size < milestoneKeys.length && `(${visibleMilestones.size}/${milestoneKeys.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end">
            <div className="p-2 border-b flex justify-between items-center">
              <span className="text-xs font-medium">Show/Hide Milestones</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onSetVisibleMilestones(new Set(milestoneKeys))}>All</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onSetVisibleMilestones(new Set())}>None</Button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {milestoneKeys.map(key => {
                const isDefault = (MILESTONE_KEYS as readonly string[]).includes(key);
                return (
                  <div key={key} className="flex items-center justify-between gap-2 py-0.5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
                      <Checkbox checked={visibleMilestones.has(key)} onCheckedChange={() => {
                        onSetVisibleMilestones(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                      }} />
                      {milestoneLabels[key] || key}
                    </label>
                    {!isDefault && (
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => onDeleteMilestone(key)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-2 border-t">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { onMilestoneFilterOpenChange(false); onOpenAddMilestone(); }}>
                <Plus className="mr-1.5 h-3 w-3" /> Add Milestone
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
          <Button variant={view === 'table' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => onSetView('table')}><Table2 className="mr-1.5 h-3.5 w-3.5" /> Table</Button>
          <Button variant={view === 'gantt' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => onSetView('gantt')}><BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Gantt</Button>
        </div>

        {/* Compact / Details toggle */}
        {view === 'table' && (
          <Button variant="outline" size="sm" className={cn("h-8 gap-2 px-3", !showExtraColumns && "bg-primary/10 border-primary/20 text-primary")} onClick={onToggleExtraColumns}>
            {showExtraColumns ? <Columns className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
            {showExtraColumns ? 'Compact View' : 'Show Details'}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-background focus-within:ring-1 focus-within:ring-primary h-8 max-w-[200px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input className="bg-transparent border-none outline-none text-xs w-full" placeholder="Search packages..." value={searchTerm} onChange={e => onSearchChange(e.target.value)} />
          {searchTerm && <X className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => onSearchChange('')} />}
        </div>

        {/* Excel export/import dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Excel</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportToExcel(packages, projectName, filteredMilestoneKeys, milestoneLabels)}><Download className="mr-2 h-4 w-4" /> Export (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" /> Import (.xlsx)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={fileInputRef as React.RefObject<HTMLInputElement>} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onImport} />

        {/* Milestones settings */}
        <Button variant="outline" size="sm" onClick={onOpenManageMilestones}>
          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Milestones
        </Button>

        {/* Packages settings */}
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onOpenManagePackages}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Packages
          </Button>
        )}

        {/* Reset all dates */}
        {canEdit && onResetAllDates && (
          <Button variant="outline" size="sm" className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10" onClick={onResetAllDates}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Dates
          </Button>
        )}

        {/* Save indicator */}
        {saving && (
          <Button size="sm" disabled>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
          </Button>
        )}
      </div>
    </div>
  );
}
