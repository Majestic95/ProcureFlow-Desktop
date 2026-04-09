import { useState, useMemo, useRef } from 'react';
import type { EquipmentPackage } from '@/types';

import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Bar colors alternating
const BAR_COLORS = ['#7B3F8A', '#E31C79'];

// Date type → milestone field mapping
const DATE_FIELD_MAP: Record<string, keyof { plannedDate: string; adjustedDate: string; actualDate: string }> = {
  planned: 'plannedDate',
  forecast: 'adjustedDate',
  actual: 'actualDate',
};

export interface GanttChartProps {
  groupedPackages: Record<string, EquipmentPackage[]>;
  milestoneKeys: string[];
  milestoneLabels: Record<string, string>;
  milestoneIcons: Record<string, string>;
  visibleDateTypes: ('planned' | 'forecast' | 'actual')[];
  collapsedGroups: Set<string>;
  toggleGroup: (group: string) => void;
  packagesCount: number;
}

function parseDate(val: string | undefined): Date | null {
  if (!val || val === 'TBD' || val === 'N/A') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function GanttChart({
  groupedPackages, milestoneKeys, milestoneLabels,
  visibleDateTypes, collapsedGroups, toggleGroup, packagesCount,
}: GanttChartProps) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateField = DATE_FIELD_MAP[visibleDateTypes[0]] || 'plannedDate';

  // Collect all valid dates to determine range
  const { minDate, maxDate, allPackages } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    const pkgs: { pkg: EquipmentPackage; discipline: string }[] = [];

    for (const [disc, packages] of Object.entries(groupedPackages)) {
      if (collapsedGroups.has(disc)) continue;
      for (const pkg of packages) {
        pkgs.push({ pkg, discipline: disc });
        for (const key of milestoneKeys) {
          const ms = pkg.milestones[key];
          if (!ms) continue;
          const d = parseDate(ms[dateField as keyof typeof ms]);
          if (d) {
            min = Math.min(min, d.getTime());
            max = Math.max(max, d.getTime());
          }
        }
      }
    }

    // Add padding: 2 weeks before and after
    const pad = 14 * 24 * 60 * 60 * 1000;
    return {
      minDate: min === Infinity ? new Date() : new Date(min - pad),
      maxDate: max === -Infinity ? new Date() : new Date(max + pad),
      allPackages: pkgs,
    };
  }, [groupedPackages, milestoneKeys, dateField, collapsedGroups]);

  const totalDays = Math.max(daysBetween(minDate, maxDate), 30);
  const dayWidth = 3 * zoom;
  const chartWidth = totalDays * dayWidth;

  const LEFT_COL = 220;
  const BAR_HEIGHT = 20;
  const BAR_GAP = 3;
  const PKG_LABEL_HEIGHT = 24;
  const GROUP_HEADER_HEIGHT = 32;

  // Build row data: for each package, get milestone bars
  type BarData = { key: string; label: string; startDate: Date; endDate: Date; colorIndex: number };
  type RowGroup = { type: 'header'; discipline: string; count: number } | { type: 'package'; pkg: EquipmentPackage; bars: BarData[] };

  const rows = useMemo(() => {
    const result: RowGroup[] = [];
    const disciplines = Object.keys(groupedPackages);

    for (const disc of disciplines) {
      const packages = groupedPackages[disc];
      if (!packages || packages.length === 0) continue;

      result.push({ type: 'header', discipline: disc, count: packages.length });

      if (collapsedGroups.has(disc)) continue;

      for (const pkg of packages) {
        const bars: BarData[] = [];
        for (let i = 0; i < milestoneKeys.length; i++) {
          const key = milestoneKeys[i];
          const ms = pkg.milestones[key];
          if (!ms) continue;
          const start = parseDate(ms[dateField as keyof typeof ms]);
          if (!start) continue;

          // End date = next milestone's start date, or start + 1 day if last
          let end: Date | null = null;
          for (let j = i + 1; j < milestoneKeys.length; j++) {
            const nextMs = pkg.milestones[milestoneKeys[j]];
            if (nextMs) {
              const nextDate = parseDate(nextMs[dateField as keyof typeof nextMs]);
              if (nextDate) { end = nextDate; break; }
            }
          }
          if (!end) end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // 1 day min

          // Only add if bar has positive duration
          if (end > start) {
            bars.push({ key, label: milestoneLabels[key] || key, startDate: start, endDate: end, colorIndex: i % 2 });
          }
        }
        result.push({ type: 'package', pkg, bars });
      }
    }
    return result;
  }, [groupedPackages, milestoneKeys, milestoneLabels, dateField, collapsedGroups]);

  // Calculate Y positions
  const rowPositions = useMemo(() => {
    let y = 0;
    return rows.map(row => {
      const pos = y;
      if (row.type === 'header') {
        y += GROUP_HEADER_HEIGHT;
      } else {
        const barCount = Math.max(row.bars.length, 1);
        y += PKG_LABEL_HEIGHT + barCount * (BAR_HEIGHT + BAR_GAP) + 8;
      }
      return pos;
    });
  }, [rows]);

  const totalHeight = rowPositions.length > 0
    ? rowPositions[rowPositions.length - 1] + (rows[rows.length - 1]?.type === 'header' ? GROUP_HEADER_HEIGHT : 100)
    : 200;

  // X coordinate from date
  const dateToX = (d: Date): number => {
    return daysBetween(minDate, d) * dayWidth;
  };

  // Month markers
  const months = useMemo(() => {
    const result: { label: string; x: number }[] = [];
    const cursor = new Date(minDate);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= maxDate) {
      result.push({ label: toMonthLabel(cursor), x: dateToX(cursor) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, maxDate, dayWidth]);

  // TODAY line
  const today = new Date();
  const todayX = dateToX(today);
  const showToday = today >= minDate && today <= maxDate;

  if (packagesCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <p className="text-sm">No packages to display.</p>
      </div>
    );
  }

  const hasVisiblePackages = rows.some(r => r.type === 'package');
  if (!hasVisiblePackages && packagesCount > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <p className="text-sm">All discipline groups are collapsed. Expand a group to view the chart.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoom(1)}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>
        <span className="text-xs text-muted-foreground ml-2">{Math.round(zoom * 100)}%</span>
        <span className="text-xs text-muted-foreground ml-auto">
          Showing: {visibleDateTypes[0] || 'planned'} dates
        </span>
      </div>

      <div className="flex">
        {/* Left column: package names */}
        <div className="flex-shrink-0 border-r bg-card" style={{ width: LEFT_COL }}>
          {/* Month header spacer */}
          <div className="h-8 border-b bg-muted/30" />

          {rows.map((row, idx) => {
            const y = rowPositions[idx];
            if (row.type === 'header') {
              return (
                <div
                  key={`h-${row.discipline}`}
                  className="flex items-center gap-2 px-3 border-b bg-muted/20 cursor-pointer hover:bg-muted/40"
                  style={{ height: GROUP_HEADER_HEIGHT }}
                  onClick={() => toggleGroup(row.discipline)}
                >
                  {collapsedGroups.has(row.discipline)
                    ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-xs font-semibold uppercase tracking-wide">{row.discipline}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">({row.count})</span>
                </div>
              );
            }
            const barCount = Math.max(row.bars.length, 1);
            const rowHeight = PKG_LABEL_HEIGHT + barCount * (BAR_HEIGHT + BAR_GAP) + 8;
            return (
              <div key={row.pkg.id} className="border-b px-3 flex items-start pt-1" style={{ height: rowHeight }}>
                <div>
                  <div className="text-xs font-medium truncate" style={{ maxWidth: LEFT_COL - 24 }}>{row.pkg.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{row.pkg.awardedSupplierName || ''}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: chart area */}
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          <div style={{ width: chartWidth, minWidth: '100%' }}>
            {/* Month headers */}
            <div className="h-8 border-b bg-muted/30 relative">
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-border/30 flex items-center px-2"
                  style={{ left: m.x }}>
                  <span className="text-[10px] text-muted-foreground font-medium">{m.label}</span>
                </div>
              ))}
            </div>

            {/* Bars */}
            {rows.map((row, idx) => {
              if (row.type === 'header') {
                return (
                  <div key={`hc-${row.discipline}`} className="border-b bg-muted/10" style={{ height: GROUP_HEADER_HEIGHT }} />
                );
              }
              const barCount = Math.max(row.bars.length, 1);
              const rowHeight = PKG_LABEL_HEIGHT + barCount * (BAR_HEIGHT + BAR_GAP) + 8;
              return (
                <div key={row.pkg.id} className="border-b relative" style={{ height: rowHeight }}>
                  {/* Month grid lines */}
                  {months.map((m, i) => (
                    <div key={i} className="absolute top-0 h-full border-l border-border/10" style={{ left: m.x }} />
                  ))}

                  {/* TODAY line */}
                  {showToday && (
                    <div className="absolute top-0 h-full w-px bg-pink-500/60 z-0" style={{ left: todayX }} />
                  )}

                  {/* Milestone bars */}
                  {row.bars.map((bar, barIdx) => {
                    const x = dateToX(bar.startDate);
                    const width = Math.max(dateToX(bar.endDate) - x, 4);
                    const barY = PKG_LABEL_HEIGHT + barIdx * (BAR_HEIGHT + BAR_GAP);
                    const color = BAR_COLORS[bar.colorIndex];

                    return (
                      <div key={bar.key} className="absolute flex items-center" style={{ left: x, top: barY, height: BAR_HEIGHT }}>
                        <div
                          className="rounded-sm flex-shrink-0 cursor-default"
                          style={{ width, height: BAR_HEIGHT, backgroundColor: color }}
                          title={`${bar.label}: ${bar.startDate.toLocaleDateString()} → ${bar.endDate.toLocaleDateString()}`}
                        />
                        <span className="text-[9px] font-medium text-muted-foreground whitespace-nowrap ml-1.5 px-1 py-0.5 rounded bg-background/80 backdrop-blur-sm">{bar.label}</span>
                      </div>
                    );
                  })}

                  {/* Empty state for package with no bars */}
                  {row.bars.length === 0 && (
                    <div className="absolute top-0 left-4 h-full flex items-center">
                      <span className="text-[10px] text-muted-foreground italic">No dates set</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 p-2 border-t bg-muted/20 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BAR_COLORS[0] }} />
          <span>Odd milestones</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BAR_COLORS[1] }} />
          <span>Even milestones</span>
        </div>
        {showToday && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-pink-500" />
            <span>Today</span>
          </div>
        )}
        <span className="ml-auto text-muted-foreground">{packagesCount} packages · {milestoneKeys.length} milestones</span>
      </div>
    </div>
  );
}
