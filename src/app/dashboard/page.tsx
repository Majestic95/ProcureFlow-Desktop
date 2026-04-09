import { useMemo } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Building2,
  FileText,
  Users,
  Loader2,
  TrendingUp,
  DollarSign,
  Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';
import { useCollection } from '@/lib/firebase-hooks-compat';
import { collection, query, where } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from "recharts";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { RFP, Proposal, Client, Schedule } from '@/types';
import { useState } from 'react';

export default function DashboardPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  const [suppliersValue, suppliersLoading] = useCollection(collection(db, 'suppliers'));
  const [clientsValue, clientsLoading] = useCollection(collection(db, 'clients'));
  const [rfpsValue, rfpsLoading] = useCollection(query(collection(db, 'rfps')));
  const [proposalsValue, proposalsLoading] = useCollection(collection(db, 'proposals'));
  const [schedulesValue, schedulesLoading] = useCollection(collection(db, 'schedules'));

  const rfps = useMemo(() => rfpsValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as RFP)) || [], [rfpsValue]);
  const proposals = useMemo(() => proposalsValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Proposal)) || [], [proposalsValue]);
  const clients = useMemo(() => clientsValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)) || [], [clientsValue]);
  const schedules = useMemo(() => schedulesValue?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)) || [], [schedulesValue]);

  // Filtering Logic
  const filteredRFPs = useMemo(() => {
    return rfps.filter(rfp => {
      const matchClient = selectedClientId === 'all' || rfp.clientId === selectedClientId;
      
      let matchProject = true;
      if (selectedProjectId !== 'all') {
        const schedule = schedules.find(s => s.id === selectedProjectId);
        const associatedRfpIds = schedule?.packages.map(p => p.associatedRfpId).filter(Boolean) || [];
        matchProject = associatedRfpIds.includes(rfp.id);
      }
      
      return matchClient && matchProject;
    });
  }, [rfps, selectedClientId, selectedProjectId, schedules]);

  const filteredProposals = useMemo(() => {
    const rfpIds = new Set(filteredRFPs.map(r => r.id));
    return proposals.filter(p => rfpIds.has(p.rfpId));
  }, [proposals, filteredRFPs]);

  const stats = useMemo(() => ({
    suppliers: suppliersValue?.size || 0,
    clients: clients.length,
    openRFPs: filteredRFPs.filter(r => r.status === 'published').length,
    proposalsSubmitted: filteredProposals.length,
  }), [suppliersValue, clients.length, filteredRFPs, filteredProposals]);

  const totalSavings = useMemo(() => {
    let totalHard = 0;
    let totalSoft = 0;

    filteredRFPs.forEach(rfp => {
      if (rfp.awardedSupplierId) {
        const rfpProposals = proposals.filter(p => p.rfpId === rfp.id);
        if (rfpProposals.length > 0) {
          const winner = rfpProposals.find(p => p.supplierId === rfp.awardedSupplierId);
          if (winner) {
            const avg = rfpProposals.reduce((sum, p) => sum + (Number(p.price) || 0), 0) / rfpProposals.length;
            if (rfp.budget) {
              totalHard += (rfp.budget - winner.price);
            }
            totalSoft += (avg - winner.price);
          }
        }
      }
    });

    return { totalHard, totalSoft };
  }, [filteredRFPs, proposals]);

  if (suppliersLoading || rfpsLoading || proposalsLoading || clientsLoading || schedulesLoading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Bar Chart Data: Budget vs Proposals (Winner vs Market Avg)
  const barChartData = filteredRFPs.slice(0, 6).map(rfp => {
    const rfpProposals = proposals.filter(p => p.rfpId === rfp.id);
    const avgProposalValue = rfpProposals.length > 0 ? rfpProposals.reduce((sum, p) => sum + (Number(p.price) || 0), 0) / rfpProposals.length : 0;
    const winner = rfp.awardedSupplierId ? rfpProposals.find(p => p.supplierId === rfp.awardedSupplierId) : null;
    
    return {
      name: rfp.title.length > 15 ? rfp.title.substring(0, 15) + '...' : rfp.title,
      fullName: rfp.title,
      budget: rfp.budget || 0,
      proposalValue: winner ? winner.price : avgProposalValue,
      isWinner: !!winner,
      status: winner ? 'Winning Bid' : 'Avg Market Bid'
    };
  });

  // Gantt Chart Data: Project Timelines
  const allTimestamps = filteredRFPs.flatMap(rfp => {
    if (!rfp.openDate || !rfp.closeDate) return [];
    const o = (rfp.openDate as any).toDate ? (rfp.openDate as any).toDate().getTime() : new Date(rfp.openDate as any).getTime();
    const c = (rfp.closeDate as any).toDate ? (rfp.closeDate as any).toDate().getTime() : new Date(rfp.closeDate as any).getTime();
    return [o, c];
  });
  const globalMinTime = allTimestamps.length > 0 ? Math.min(...allTimestamps) : Date.now();

  const ganttChartData = filteredRFPs.filter(r => r.openDate && r.closeDate).slice(0, 8).map(rfp => {
    const openDate = (rfp.openDate as any).toDate ? (rfp.openDate as any).toDate() : new Date(rfp.openDate as any);
    const closeDate = (rfp.closeDate as any).toDate ? (rfp.closeDate as any).toDate() : new Date(rfp.closeDate as any);
    
    return {
      name: rfp.title.length > 15 ? rfp.title.substring(0, 15) + '...' : rfp.title,
      offset: openDate.getTime() - globalMinTime,
      duration: Math.max(0, closeDate.getTime() - openDate.getTime()),
      start: openDate.getTime(),
      rawStart: openDate,
      rawEnd: closeDate,
    };
  }).sort((a,b) => a.start - b.start);

  const formatLargeCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absValue >= 1000000000) return `${sign}${(absValue / 1000000000).toFixed(1)} Bi`;
    if (absValue >= 1000000) return `${sign}${(absValue / 1000000).toFixed(1)} M`;
    if (absValue >= 1000) return `${sign}${(absValue / 1000).toFixed(0)} Mil`;
    return `${sign}$${absValue.toFixed(0)}`;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value}`;
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp), 'MMM d, yyyy');
  };

  return (
    <div className="container mx-auto py-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Executive Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time procurement metrics and strategic savings performance.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-[180px] bg-card/50 backdrop-blur-sm border-none shadow-sm h-9 text-xs">
                    <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-[180px] bg-card/50 backdrop-blur-sm border-none shadow-sm h-9 text-xs">
                    <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {schedules.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.projectName}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full border border-primary/10 h-9">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Live System Status</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Suppliers"
          value={stats.suppliers.toString()}
          icon={<Building2 className="h-5 w-5" />}
          description="Integrated network"
          className="lg:col-span-1"
        />
        <StatCard
          title="Clients"
          value={stats.clients.toString()}
          icon={<Users className="h-5 w-5" />}
          description="Registered clients"
          className="lg:col-span-1"
        />
        <StatCard
          title="Published RFPs"
          value={stats.openRFPs.toString()}
          icon={<Briefcase className="h-5 w-5" />}
          description="Active opportunities"
          className="lg:col-span-1"
        />
        <StatCard
          title="Total Hard Savings"
          value={formatLargeCurrency(totalSavings.totalHard)}
          icon={<TrendingUp className="h-5 w-5" />}
          description="Efficiency realized"
          tooltip="Hard Savings is the difference between the project budget and the winning proposal value for all awarded RFPs."
          className="lg:col-span-1 border-l-4 border-l-green-500"
        />
        <StatCard
          title="Total Soft Savings"
          value={formatLargeCurrency(totalSavings.totalSoft)}
          icon={<DollarSign className="h-5 w-5" />}
          description="Market advantage"
          tooltip="Soft Savings is the difference between the average of all proposals and the winning proposal value."
          className="lg:col-span-1 border-l-4 border-l-blue-500"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-12 lg:grid-cols-12">
        {/* Budget vs Proposals Chart */}
        <Card className="md:col-span-7 border-none shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Budget vs. Market Response
            </CardTitle>
            <CardDescription>
              Comparison of estimated budgets across key projects against total market interest.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px] pt-4">
            <ChartContainer className="!aspect-auto h-full w-full" config={{
                budget: { label: "Allocated Budget", color: "hsl(340 80% 50%)" },
                proposalValue: { label: "Proposal Value", color: "hsl(280 80% 60%)" }
            }}>
                <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis
                    dataKey="name"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatCurrency}
                    className="fill-muted-foreground"
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                                <div className="bg-popover/95 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl text-xs space-y-2">
                                    <p className="font-bold text-primary border-b border-border pb-1 mb-1">{data.fullName}</p>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Budget:</span>
                                        <span className="font-bold text-foreground">{formatCurrency(data.budget)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">{data.status}:</span>
                                        <span className={`font-bold ${data.isWinner ? 'text-purple-500' : 'text-purple-400'}`}>
                                            {formatCurrency(data.proposalValue)}
                                        </span>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 500 }}
                    payload={[
                        { value: 'budget', type: 'circle', id: 'budget', color: 'hsl(340 80% 50%)' },
                        { value: 'winning bid', type: 'circle', id: 'winner', color: 'hsl(280 80% 60%)' },
                        { value: 'proposals', type: 'circle', id: 'avg', color: 'hsl(280 80% 85%)' },
                    ]}
                  />
                  <Bar dataKey="budget" fill="hsl(340 80% 50%)" radius={[6, 6, 0, 0]} barSize={24} />
                  <Bar dataKey="proposalValue" radius={[6, 6, 0, 0]} barSize={24}>
                    {barChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isWinner ? "hsl(280 80% 60%)" : "hsl(280 80% 85%)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Project Timeline Gantt-style Chart */}
        <Card className="md:col-span-5 border-none shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-500" />
              Procurement Cycle
            </CardTitle>
            <CardDescription>
              Execution timelines for active RFP processes.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                  layout="vertical" 
                  data={ganttChartData} 
                  margin={{ top: 5, right: 30, left: 10, bottom: 20 }}
                  barGap={8}
              >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.1} />
                  <XAxis 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    hide 
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    width={100}
                    className="fill-muted-foreground font-medium"
                  />
                  <ChartTooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                                <div className="bg-popover/90 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl text-xs">
                                    <p className="font-bold border-b border-border pb-1 mb-2 text-primary">{data.name}</p>
                                    <div className="space-y-1 text-muted-foreground font-medium">
                                      <p className="flex justify-between gap-4">Start: <span className="text-foreground">{formatDate(data.start)}</span></p>
                                      <p className="flex justify-between gap-4">End: <span className="text-foreground">{formatDate(data.start + data.duration)}</span></p>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                  />
                  <Bar dataKey="offset" stackId="a" fill="transparent" />
                  <Bar 
                    dataKey="duration" 
                    stackId="a" 
                    fill="#9333ea" 
                    radius={[0, 10, 10, 0]} 
                    barSize={12}
                  />
                </BarChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
