import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, Line, ComposedChart,
} from 'recharts';
import type {
  EquipmentPackage, Risk, ProjectTodo, DeliveryBatch,
  PackageContract, ChangeOrder, ProjectQuestion,
} from '@/types';
import { COMPLETION_MILESTONES } from '@/types';

// ── Chart hex colors ──
const C = {
  purple: '#572D5F', pink: '#E31C79', emerald: '#10b981', amber: '#f59e0b',
  red: '#ef4444', blue: '#3b82f6', sky: '#0ea5e9', gray: '#6b7280',
  green: '#22c55e', orange: '#f97316',
};

const TOOLTIP_STYLE = { backgroundColor: '#1f2937', border: 'none', borderRadius: 8 };
const TOOLTIP_LABEL = { color: '#f9fafb' };
const TOOLTIP_ITEM = { color: '#d1d5db' };

interface DashboardChartsProps {
  chartType: string;
  packages: EquipmentPackage[];
  risks: Risk[];
  todos: ProjectTodo[];
  deliveries: DeliveryBatch[];
  contracts: PackageContract[];
  changeOrders: ChangeOrder[];
  questions: ProjectQuestion[];
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
      No data available
    </div>
  );
}

// ── 1. Budget vs Award ──
function BudgetVsAward({ packages }: { packages: EquipmentPackage[] }) {
  const data = packages
    .filter((p) => p.budget || p.awardValue)
    .map((p) => ({
      name: p.name.length > 14 ? p.name.slice(0, 12) + '...' : p.name,
      budget: p.budget ?? 0,
      award: p.awardValue ?? 0,
      delta: (p.budget ?? 0) - (p.awardValue ?? 0),
    }));
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Legend />
        <Bar dataKey="budget" fill={C.blue} name="Budget" />
        <Bar dataKey="award" fill={C.pink} name="Award" />
        <Line type="monotone" dataKey="delta" stroke={C.amber} name="Delta" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 2. RAG Status ──
function RagStatus({ packages }: { packages: EquipmentPackage[] }) {
  const counts: Record<string, number> = { 'on-track': 0, 'at-risk': 0, late: 0, done: 0 };
  packages.forEach((p) => { if (p.ragStatus && counts[p.ragStatus] !== undefined) counts[p.ragStatus]++; });
  const colors: Record<string, string> = { 'on-track': C.emerald, 'at-risk': C.amber, late: C.red, done: C.sky };
  const data = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={120} label>
          {data.map((d) => <Cell key={d.name} fill={colors[d.name] ?? C.gray} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── 3. Savings ──
function Savings({ packages }: { packages: EquipmentPackage[] }) {
  const data = packages
    .filter((p) => p.initialBidPrice != null && p.bafoPrice != null)
    .map((p) => {
      const saving = (p.initialBidPrice ?? 0) - (p.bafoPrice ?? 0);
      return { name: p.name.length > 14 ? p.name.slice(0, 12) + '...' : p.name, saving };
    });
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Bar dataKey="saving" name="Savings">
          {data.map((d, i) => <Cell key={i} fill={d.saving >= 0 ? C.green : C.red} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 4. Risk Heatmap (div grid) ──
function RiskHeatmap({ risks }: { risks: Risk[] }) {
  if (!risks.length) return <Empty />;
  const grid: Record<string, number> = {};
  risks.forEach((r) => {
    if (!r.impact || !r.likelihood) return;
    const key = `${r.impact}-${r.likelihood}`;
    grid[key] = (grid[key] ?? 0) + 1;
  });
  const cellColor = (score: number) => {
    if (score >= 16) return 'bg-red-600 text-white';
    if (score >= 10) return 'bg-orange-500 text-white';
    if (score >= 5) return 'bg-amber-400 text-gray-900';
    return 'bg-emerald-400 text-gray-900';
  };
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <div className="text-xs text-muted-foreground mb-1">Impact (Y) x Likelihood (X)</div>
      <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-0.5 w-fit">
        <div />
        {[1, 2, 3, 4, 5].map((l) => (
          <div key={l} className="w-12 h-6 flex items-center justify-center text-xs text-muted-foreground font-medium">{l}</div>
        ))}
        {[5, 4, 3, 2, 1].map((imp) => (
          <>
            <div key={`y-${imp}`} className="w-6 h-12 flex items-center justify-center text-xs text-muted-foreground font-medium">{imp}</div>
            {[1, 2, 3, 4, 5].map((lik) => {
              const count = grid[`${imp}-${lik}`] ?? 0;
              const score = imp * lik;
              return (
                <div key={`${imp}-${lik}`} className={`w-12 h-12 flex items-center justify-center rounded text-xs font-bold ${cellColor(score)}`}>
                  {count || ''}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

// ── 5. Delivery Status ──
function DeliveryStatus({ deliveries }: { deliveries: DeliveryBatch[] }) {
  const colors: Record<string, string> = { pending: C.gray, 'in-transit': C.sky, delivered: C.emerald, delayed: C.red };
  const counts: Record<string, number> = {};
  deliveries.forEach((d) => { counts[d.status] = (counts[d.status] ?? 0) + 1; });
  const data = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={120} label>
          {data.map((d) => <Cell key={d.name} fill={colors[d.name] ?? C.gray} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── 6. Contract Completion ──
function ContractCompletion({ contracts }: { contracts: PackageContract[] }) {
  const data = contracts.map((c) => {
    const applicable = c.terms.filter((t) => t.status !== 'na');
    const pct = applicable.length ? Math.round((applicable.filter((t) => t.status === 'complete').length / applicable.length) * 100) : 0;
    return { name: c.packageName.length > 18 ? c.packageName.slice(0, 16) + '...' : c.packageName, percent: pct };
  });
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} unit="%" />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Bar dataKey="percent" fill={C.emerald} name="% Complete" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 7. Payment Progress ──
function PaymentProgress({ packages }: { packages: EquipmentPackage[] }) {
  const data = packages
    .filter((p) => p.paymentMilestones?.length)
    .map((p) => {
      const ms = p.paymentMilestones!;
      const total = ms.reduce((s, m) => s + m.percentage, 0) || 100;
      const paid = ms.filter((m) => m.status === 'paid').reduce((s, m) => s + m.percentage, 0);
      const invoiced = ms.filter((m) => m.status === 'invoiced').reduce((s, m) => s + m.percentage, 0);
      const pending = Math.max(0, total - paid - invoiced);
      return {
        name: p.name.length > 14 ? p.name.slice(0, 12) + '...' : p.name,
        paid: Math.round((paid / total) * 100),
        invoiced: Math.round((invoiced / total) * 100),
        pending: Math.round((pending / total) * 100),
      };
    });
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} unit="%" />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Legend />
        <Bar dataKey="paid" stackId="a" fill={C.emerald} name="Paid" />
        <Bar dataKey="invoiced" stackId="a" fill={C.amber} name="Invoiced" />
        <Bar dataKey="pending" stackId="a" fill={C.gray} name="Pending" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 8. Change Orders by Status ──
function COByStatus({ changeOrders }: { changeOrders: ChangeOrder[] }) {
  const colors: Record<string, string> = { draft: C.gray, submitted: C.amber, approved: C.emerald, rejected: C.red };
  const grouped: Record<string, number> = {};
  changeOrders.forEach((co) => { grouped[co.status] = (grouped[co.status] ?? 0) + Math.abs(co.value); });
  const data = Object.entries(grouped).map(([k, v]) => ({ status: k, value: v }));
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="status" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Bar dataKey="value" name="Total Value">
          {data.map((d, i) => <Cell key={i} fill={colors[d.status] ?? C.gray} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 9. Task Status ──
function TaskStatus({ todos }: { todos: ProjectTodo[] }) {
  const colors: Record<string, string> = { open: C.gray, 'in-progress': C.amber, done: C.emerald };
  const counts: Record<string, number> = {};
  todos.forEach((t) => { counts[t.status] = (counts[t.status] ?? 0) + 1; });
  const data = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={120} label>
          {data.map((d) => <Cell key={d.name} fill={colors[d.name] ?? C.gray} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── 10. Schedule Progress ──
function ScheduleProgress({ packages }: { packages: EquipmentPackage[] }) {
  const data = packages.map((p) => {
    const total = COMPLETION_MILESTONES.length;
    const done = COMPLETION_MILESTONES.filter((k) => {
      const m = p.milestones?.[k];
      return m && m.actualDate && m.actualDate !== '' && m.actualDate !== 'TBD' && m.actualDate !== 'N/A';
    }).length;
    return {
      name: p.name.length > 18 ? p.name.slice(0, 16) + '...' : p.name,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} unit="%" />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        <Bar dataKey="percent" fill={C.blue} name="% Complete" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main Component ──
export default function DashboardCharts(props: DashboardChartsProps) {
  switch (props.chartType) {
    case 'budget-vs-award':     return <BudgetVsAward packages={props.packages} />;
    case 'rag-status':          return <RagStatus packages={props.packages} />;
    case 'savings':             return <Savings packages={props.packages} />;
    case 'risk-heatmap':        return <RiskHeatmap risks={props.risks} />;
    case 'delivery-status':     return <DeliveryStatus deliveries={props.deliveries} />;
    case 'contract-completion': return <ContractCompletion contracts={props.contracts} />;
    case 'payment-progress':    return <PaymentProgress packages={props.packages} />;
    case 'co-by-status':        return <COByStatus changeOrders={props.changeOrders} />;
    case 'task-status':         return <TaskStatus todos={props.todos} />;
    case 'schedule-progress':   return <ScheduleProgress packages={props.packages} />;
    default:
      return <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">Unknown chart: {props.chartType}</div>;
  }
}
