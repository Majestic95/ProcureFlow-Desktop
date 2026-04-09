import { useMemo, useState } from 'react';
import type {
  Project, EquipmentPackage, Risk, ProjectTodo,
  DeliveryBatch, PackageContract, ChangeOrder, ProjectQuestion,
  RagStatus,
} from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FINANCIAL_COLORS, RAG_COLORS } from '@/lib/colors';
import DashboardCharts from './dashboard-charts';
import { PackagesTable } from './packages-table';

interface ProjectDashboardProps {
  projectId: string;
  clientId: string;
  project: Project;
  packages: EquipmentPackage[];
  risks: Risk[];
  todos: ProjectTodo[];
  deliveries: DeliveryBatch[];
  contracts: PackageContract[];
  changeOrders: ChangeOrder[];
  questions: ProjectQuestion[];
  isAdmin: boolean;
  canEdit: boolean;
}

const CHART_OPTIONS = [
  { value: 'budget-vs-award', label: 'Budget vs Award' },
  { value: 'rag-status', label: 'RAG Status Distribution' },
  { value: 'savings', label: 'Savings per Package' },
  { value: 'risk-heatmap', label: 'Risk Heat Map' },
  { value: 'delivery-status', label: 'Delivery Status' },
  { value: 'contract-completion', label: 'Contract Completion' },
  { value: 'payment-progress', label: 'Payment Progress' },
  { value: 'co-by-status', label: 'Change Order Value by Status' },
  { value: 'task-status', label: 'Task Status' },
  { value: 'schedule-progress', label: 'Schedule Progress' },
] as const;

type ChartOption = (typeof CHART_OPTIONS)[number]['value'];

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatCurrencyFull(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function deltaColor(val: number): string {
  if (val > 0) return FINANCIAL_COLORS.underBudget;
  if (val < 0) return FINANCIAL_COLORS.overBudget;
  return FINANCIAL_COLORS.neutral;
}

export function ProjectDashboard({
  projectId,
  clientId,
  project,
  packages,
  risks,
  todos,
  deliveries,
  contracts,
  changeOrders,
  questions,
  isAdmin,
  canEdit,
}: ProjectDashboardProps) {
  const [selectedChart, setSelectedChart] = useState<ChartOption>('budget-vs-award');

  // ---------- Schedule KPIs ----------
  const scheduleKpis = useMemo(() => {
    const total = packages.length;
    const boughtOut = packages.filter((p) => (p.awardValue ?? 0) > 0).length;
    const pctBoughtOut = total > 0 ? Math.round((boughtOut / total) * 100) : 0;

    const ragCounts: Record<RagStatus, number> = {
      'on-track': 0, 'at-risk': 0, late: 0, done: 0,
    };
    for (const pkg of packages) {
      const s = pkg.ragStatus ?? 'on-track';
      ragCounts[s]++;
    }
    return { total, boughtOut, pctBoughtOut, ragCounts };
  }, [packages]);

  // ---------- Financial KPIs ----------
  const financialKpis = useMemo(() => {
    let totalBudget = 0;
    let totalAwarded = 0;
    let totalSavings = 0;
    for (const pkg of packages) {
      totalBudget += pkg.budget ?? 0;
      totalAwarded += pkg.awardValue ?? 0;
      const initial = pkg.initialBidPrice ?? 0;
      const bafo = pkg.bafoPrice ?? 0;
      if (initial > 0 && bafo > 0) totalSavings += initial - bafo;
    }
    const totalCO = changeOrders
      .filter((co) => co.status === 'approved')
      .reduce((sum, co) => sum + co.value, 0);
    const totalDelta = totalBudget - totalAwarded - totalCO;
    return { totalBudget, totalAwarded, totalDelta, totalSavings, totalCO };
  }, [packages, changeOrders]);

  // ---------- Operations KPIs ----------
  const operationsKpis = useMemo(() => {
    const deliveryCounts = { pending: 0, 'in-transit': 0, delivered: 0, delayed: 0 };
    for (const d of deliveries) {
      deliveryCounts[d.status]++;
    }

    let termsComplete = 0;
    let termsTotal = 0;
    for (const c of contracts) {
      for (const t of c.terms) {
        if (t.status !== 'na') {
          termsTotal++;
          if (t.status === 'complete') termsComplete++;
        }
      }
    }
    const termsPct = termsTotal > 0 ? Math.round((termsComplete / termsTotal) * 100) : 0;

    const openRisks = risks.filter((r) => r.status === 'open');
    const riskCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    let totalExposure = 0;
    for (const r of openRisks) {
      riskCounts[r.rating]++;
      totalExposure += r.estimatedFinancialValue ?? 0;
    }

    return { deliveryCounts, termsComplete, termsTotal, termsPct, riskCounts, totalExposure };
  }, [deliveries, contracts, risks]);

  // ---------- Activity KPIs ----------
  const activityKpis = useMemo(() => {
    const taskCounts = { open: 0, 'in-progress': 0, done: 0 };
    for (const t of todos) {
      if (!t.archived) taskCounts[t.status]++;
    }

    const openQuestions = questions.filter((q) => q.status === 'open').length;

    // Upcoming milestones: milestones with plannedDate in next 14 days
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    let upcomingMilestones = 0;
    for (const pkg of packages) {
      for (const [, ms] of Object.entries(pkg.milestones)) {
        const dateStr = ms.adjustedDate && ms.adjustedDate !== 'TBD' && ms.adjustedDate !== 'N/A'
          ? ms.adjustedDate
          : ms.plannedDate;
        if (dateStr && dateStr !== 'TBD' && dateStr !== 'N/A' && (!ms.actualDate || ms.actualDate === 'TBD')) {
          const d = new Date(dateStr);
          if (d >= now && d <= in14Days) upcomingMilestones++;
        }
      }
    }

    return { taskCounts, openQuestions, upcomingMilestones };
  }, [todos, questions, packages]);

  return (
    <div className="space-y-6">
      {/* ===== SECTION 1: KPI Cards ===== */}

      {/* Row 1: Schedule */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Schedule</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="% Bought Out" value={`${scheduleKpis.pctBoughtOut}%`}
            sub={`${scheduleKpis.boughtOut} of ${scheduleKpis.total}`} />
          <KpiCard label="On Track / At Risk">
            <div className="flex gap-1.5 flex-wrap mt-1">
              <Badge className={RAG_COLORS['on-track']}>{scheduleKpis.ragCounts['on-track']}</Badge>
              <Badge className={RAG_COLORS['at-risk']}>{scheduleKpis.ragCounts['at-risk']}</Badge>
              <Badge className={RAG_COLORS['late']}>{scheduleKpis.ragCounts.late}</Badge>
              <Badge className={RAG_COLORS['done']}>{scheduleKpis.ragCounts.done}</Badge>
            </div>
          </KpiCard>
          <KpiCard label="Packages" value={String(scheduleKpis.total)} />
        </div>
      </div>

      {/* Row 2: Financial */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Financial</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Total Budget" value={formatCurrency(financialKpis.totalBudget)}
            sub={formatCurrencyFull(financialKpis.totalBudget)} />
          <KpiCard label="Total Awarded" value={formatCurrency(financialKpis.totalAwarded)}
            sub={formatCurrencyFull(financialKpis.totalAwarded)} />
          <KpiCard label="Total Delta"
            value={`${financialKpis.totalDelta >= 0 ? '+' : ''}${formatCurrency(financialKpis.totalDelta)}`}
            valueClassName={deltaColor(financialKpis.totalDelta)} />
          <KpiCard label="Total Savings"
            value={formatCurrency(financialKpis.totalSavings)}
            valueClassName={financialKpis.totalSavings > 0 ? FINANCIAL_COLORS.underBudget : ''} />
          <KpiCard label="CO Exposure"
            value={formatCurrency(financialKpis.totalCO)}
            valueClassName={financialKpis.totalCO > 0 ? FINANCIAL_COLORS.overBudget : ''} />
        </div>
      </div>

      {/* Row 3: Operations */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Operations</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Deliveries">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-xs">
              <span>Pending: <strong>{operationsKpis.deliveryCounts.pending}</strong></span>
              <span>In Transit: <strong>{operationsKpis.deliveryCounts['in-transit']}</strong></span>
              <span>Delivered: <strong>{operationsKpis.deliveryCounts.delivered}</strong></span>
              <span className={operationsKpis.deliveryCounts.delayed > 0 ? 'text-red-500' : ''}>
                Delayed: <strong>{operationsKpis.deliveryCounts.delayed}</strong>
              </span>
            </div>
          </KpiCard>
          <KpiCard label="Contract Terms"
            value={`${operationsKpis.termsComplete}/${operationsKpis.termsTotal}`}
            sub={`${operationsKpis.termsPct}% complete`} />
          <KpiCard label="Open Risks">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-xs">
              <span className="text-emerald-500">Low: <strong>{operationsKpis.riskCounts.low}</strong></span>
              <span className="text-amber-500">Med: <strong>{operationsKpis.riskCounts.medium}</strong></span>
              <span className="text-orange-500">High: <strong>{operationsKpis.riskCounts.high}</strong></span>
              <span className="text-red-500">Crit: <strong>{operationsKpis.riskCounts.critical}</strong></span>
            </div>
          </KpiCard>
          <KpiCard label="Risk Exposure"
            value={formatCurrency(operationsKpis.totalExposure)}
            valueClassName={operationsKpis.totalExposure > 0 ? 'text-amber-500' : ''} />
        </div>
      </div>

      {/* Row 4: Activity */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Tasks">
            <div className="flex gap-3 mt-1 text-xs">
              <span>Open: <strong>{activityKpis.taskCounts.open}</strong></span>
              <span className="text-amber-500">In Progress: <strong>{activityKpis.taskCounts['in-progress']}</strong></span>
              <span className="text-emerald-500">Done: <strong>{activityKpis.taskCounts.done}</strong></span>
            </div>
          </KpiCard>
          <KpiCard label="Open Questions" value={String(activityKpis.openQuestions)} />
          <KpiCard label="Upcoming Milestones" value={String(activityKpis.upcomingMilestones)}
            sub="Due within 14 days" />
        </div>
      </div>

      {/* ===== SECTION 2: Chart Area ===== */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Charts</h3>
          <Select value={selectedChart} onValueChange={(v) => setSelectedChart(v as ChartOption)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select Chart" />
            </SelectTrigger>
            <SelectContent>
              {CHART_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DashboardCharts
          chartType={selectedChart}
          packages={packages}
          risks={risks}
          todos={todos}
          deliveries={deliveries}
          contracts={contracts}
          changeOrders={changeOrders}
          questions={questions}
        />
      </div>

      {/* ===== SECTION 3: Packages Table ===== */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Packages</h3>
        <PackagesTable
          projectId={projectId}
          clientId={clientId}
          packages={packages}
          isAdmin={isAdmin}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

// ---------- Small KPI Card ----------

interface KpiCardProps {
  label: string;
  value?: string;
  sub?: string;
  valueClassName?: string;
  children?: React.ReactNode;
}

function KpiCard({ label, value, sub, valueClassName, children }: KpiCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value && (
          <p className={`text-lg font-bold leading-tight ${valueClassName ?? ''}`}>{value}</p>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {children}
      </CardContent>
    </Card>
  );
}
