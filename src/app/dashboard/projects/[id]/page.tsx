import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, updateDoc,
  serverTimestamp, query, orderBy,
} from '@/lib/firestore-compat';
import type { Project, EquipmentPackage, Client, Risk, ProjectQuestion, ProjectTodo, DeliveryBatch, PackageContract, ChangeOrder } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { ensureDate } from '@/lib/utils';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, FolderKanban } from 'lucide-react';
import { ScheduleTab } from '@/components/projects/schedule-tab';
import RfpsTab from '@/components/projects/rfps-tab';
import { PackagesTable } from '@/components/projects/packages-table';
import { ProjectDashboard } from '@/components/projects/project-dashboard';
import { FinancialsTab } from '@/components/projects/financials-tab';
import { RisksTab } from '@/components/projects/risks-tab';
import { QaTab } from '@/components/projects/qa-tab';
import { TasksTab } from '@/components/projects/tasks-tab';
import { DeliveriesTab } from '@/components/projects/deliveries-tab';
import { ContractsTab } from '@/components/projects/contracts-tab';
import { NotesButton } from '@/components/notes/notes-button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: Project['status'][] = ['active', 'on-hold', 'completed', 'archived'];

const TAB_LABELS: Record<string, string> = {
  overview: 'Overview',
  schedule: 'Schedule',
  rfps: 'RFPs',
  financials: 'Financials',
  deliveries: 'Deliveries',
  contracts: 'Contracts',
  risks: 'Risks',
  qa: 'Q&A',
  tasks: 'Tasks',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId!;
  const { profile, isAdmin } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [packages, setPackages] = useState<EquipmentPackage[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [todos, setTodos] = useState<ProjectTodo[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryBatch[]>([]);
  const [contracts, setContracts] = useState<PackageContract[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [questions, setQuestions] = useState<ProjectQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  // Read initial tab from URL hash (e.g., #schedule)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash && TAB_LABELS[hash]) return hash;
    }
    return 'overview';
  });

  // Listen for hashchange events (from mention links, pins, etc.)
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.replace('#', '');
      if (hash && TAB_LABELS[hash]) setActiveTab(hash);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync hash to URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `${window.location.pathname}#${tab}`);
    }
  };

  // ---- Real-time listeners ------------------------------------------------

  useEffect(() => {
    if (!id) return;

    const unsubs: (() => void)[] = [];

    // Project document
    unsubs.push(
      onSnapshot(doc(db, 'projects', id), (snap) => {
        if (snap.exists()) {
          setProject({ id: snap.id, ...snap.data() } as Project);
        }
        setLoading(false);
      }, (err) => { console.error('[ProjectDetail] project listener error:', err); }),
    );

    // Packages subcollection
    const pkgQuery = query(
      collection(db, 'projects', id, 'packages'),
      orderBy('itemNumber'),
    );
    unsubs.push(
      onSnapshot(pkgQuery, (snap) => {
        setPackages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EquipmentPackage)));
      }, (err) => { console.error('[ProjectDetail] packages listener error:', err); }),
    );

    // Clients collection (for overview badge)
    unsubs.push(
      onSnapshot(collection(db, 'clients'), (snap) => {
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
      }, (err) => { console.error('[ProjectDetail] clients listener error:', err); }),
    );

    // Dashboard data — all subcollections for live KPIs and charts
    unsubs.push(
      onSnapshot(collection(db, 'projects', id, 'risks'), (snap) => {
        setRisks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Risk)));
      }, (err) => { console.error('[ProjectDetail] risks listener error:', err); }),
    );
    unsubs.push(
      onSnapshot(collection(db, 'projects', id, 'todos'), (snap) => {
        setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectTodo)));
      }, (err) => { console.error('[ProjectDetail] todos listener error:', err); }),
    );
    unsubs.push(
      onSnapshot(collection(db, 'projects', id, 'deliveries'), (snap) => {
        setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryBatch)));
      }, (err) => { console.error('[ProjectDetail] deliveries listener error:', err); }),
    );
    unsubs.push(
      onSnapshot(collection(db, 'projects', id, 'contracts'), (snap) => {
        setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() } as PackageContract)));
      }, (err) => { console.error('[ProjectDetail] contracts listener error:', err); }),
    );
    unsubs.push(
      onSnapshot(collection(db, 'projects', id, 'changeOrders'), (snap) => {
        setChangeOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrder)));
      }, (err) => { console.error('[ProjectDetail] changeOrders listener error:', err); }),
    );
    unsubs.push(
      onSnapshot(collection(db, 'projects', id, 'questions'), (snap) => {
        setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectQuestion)));
      }, (err) => { console.error('[ProjectDetail] questions listener error:', err); }),
    );

    return () => unsubs.forEach((u) => u());
  }, [id]);

  // ---- Handlers -----------------------------------------------------------

  const canEdit = profile?.role === 'editor' || isAdmin;

  async function handleStatusChange(status: Project['status']) {
    if (!project) return;
    try {
      await updateDoc(doc(db, 'projects', id), { status, updatedAt: serverTimestamp() });
      logAudit({
        action: 'project.status_changed',
        category: 'client',
        targetCollection: 'projects',
        targetDocId: id,
        clientId: project?.clientId,
        details: { projectName: project?.name, newStatus: status },
      });
      toast({ title: 'Status updated' });
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  }

  // ---- Render -------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-destructive">Project not found.</p>
      </div>
    );
  }

  const clientName =
    clients.find((c) => c.id === project.clientId)?.name ?? project.clientName ?? '—';

  const createdDate = ensureDate(project.createdAt).toLocaleDateString();

  return (
    <div className="container mx-auto py-2 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/dashboard/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>

        <FolderKanban className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <Badge variant="outline">{clientName}</Badge>
        <Badge variant="secondary">{project.status}</Badge>

        {canEdit && (
          <Select value={project.status} onValueChange={(v) => handleStatusChange(v as Project['status'])}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace('-', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto">
          <NotesButton
            entityType="project"
            entityId={id}
            entityName={project.name}
            currentTab={activeTab}
            currentTabLabel={TAB_LABELS[activeTab]}
          />
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="rfps">RFPs</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="risks">Risks</TabsTrigger>
          <TabsTrigger value="qa">Q&amp;A</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        {/* ---- Overview / Dashboard Tab ---- */}
        <TabsContent value="overview" className="pt-4">
          <ProjectDashboard
            projectId={id}
            clientId={project.clientId}
            project={project}
            packages={packages}
            risks={risks}
            todos={todos}
            deliveries={deliveries}
            contracts={contracts}
            changeOrders={changeOrders}
            questions={questions}
            isAdmin={isAdmin}
            canEdit={canEdit}
          />
        </TabsContent>

        {/* ---- Schedule Tab ---- */}
        <TabsContent value="schedule" className="pt-4">
          <ScheduleTab
            projectId={id}
            clientId={project.clientId}
            packages={packages}
            canEdit={canEdit}
            projectName={project.name}
          />
        </TabsContent>

        {/* ---- RFPs Tab ---- */}
        <TabsContent value="rfps" className="pt-4">
          <RfpsTab projectId={id} clientId={project.clientId} canEdit={canEdit} />
        </TabsContent>

        {/* ---- Financials Tab ---- */}
        <TabsContent value="financials" className="pt-4">
          <FinancialsTab
            projectId={id}
            clientId={project.clientId}
            packages={packages}
            canEdit={canEdit}
          />
        </TabsContent>

        {/* ---- Risks Tab ---- */}
        <TabsContent value="risks" className="pt-4">
          <RisksTab projectId={id} clientId={project.clientId} canEdit={canEdit} />
        </TabsContent>

        {/* ---- Q&A Tab ---- */}
        <TabsContent value="qa" className="pt-4">
          <QaTab projectId={id} clientId={project.clientId} packages={packages} canEdit={canEdit} />
        </TabsContent>

        {/* ---- Tasks Tab ---- */}
        <TabsContent value="tasks" className="pt-4">
          <TasksTab projectId={id} clientId={project.clientId} packages={packages} canEdit={canEdit} />
        </TabsContent>

        {/* ---- Deliveries Tab ---- */}
        <TabsContent value="deliveries" className="pt-4">
          <DeliveriesTab projectId={id} clientId={project.clientId} packages={packages} canEdit={canEdit} />
        </TabsContent>

        {/* ---- Contracts Tab ---- */}
        <TabsContent value="contracts" className="pt-4">
          <ContractsTab projectId={id} clientId={project.clientId} packages={packages} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
