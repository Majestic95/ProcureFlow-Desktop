import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, deleteDoc, doc } from '@/lib/firestore-compat';
import { db, auth } from '@/lib/firebase';
import type { Schedule, Client } from '@/types';
import { STANDARD_PACKAGES, MILESTONE_KEYS } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import AccessDenied from '@/components/auth/access-denied';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, CalendarRange, FolderOpen, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { ensureDate } from '@/lib/utils';

function createEmptyMilestones(): Record<string, { plannedDate: string; adjustedDate: string; actualDate: string }> {
  const m: Record<string, { plannedDate: string; adjustedDate: string; actualDate: string }> = {};
  for (const key of MILESTONE_KEYS) {
    m[key] = { plannedDate: 'TBD', adjustedDate: 'TBD', actualDate: 'TBD' };
  }
  return m;
}

export default function SchedulesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClientId, setNewClientId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // Load schedules
  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSchedules(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        } as Schedule;
      }));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Load clients for the dialog
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });
    return () => unsub();
  }, []);

  async function handleCreate() {
    if (!newClientId || !newProjectName.trim()) return;
    setCreating(true);
    const client = clients.find(c => c.id === newClientId);
    const defaultPackages = STANDARD_PACKAGES.map((name, i) => ({
      id: crypto.randomUUID(),
      name,
      discipline: 'Mechanical' as const,
      milestones: createEmptyMilestones(),
    }));
    try {
      const docRef = await addDoc(collection(db, 'schedules'), {
        clientId: newClientId,
        clientName: client?.name || '',
        projectName: newProjectName.trim(),
        packages: defaultPackages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || '',
      });
      logAudit({ action: 'schedule.created', category: 'schedule', targetCollection: 'schedules', targetDocId: docRef.id, clientId: newClientId, details: { projectName: newProjectName } });
      toast({ title: 'Schedule Created', description: `"${newProjectName.trim()}" has been created.` });
      setIsDialogOpen(false);
      setNewClientId('');
      setNewProjectName('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'schedules', deleteTarget.id));
      logAudit({ action: 'schedule.deleted', category: 'schedule', targetCollection: 'schedules', targetDocId: deleteTarget.id, details: { projectName: deleteTarget.projectName } });
      toast({ title: 'Schedule Deleted' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
    setDeleteTarget(null);
  }

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAdmin) return <AccessDenied inline />;

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule Management</h1>
          <p className="text-sm text-muted-foreground">Manage procurement schedules and package milestones.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="mr-2 h-4 w-4" /> New Schedule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Schedule</DialogTitle>
              <DialogDescription>Select a client and enter the project name.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={newClientId} onValueChange={setNewClientId}>
                  <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input placeholder="e.g., Data Center Phase 2" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !newClientId || !newProjectName.trim()}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarRange className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Schedules Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first procurement schedule to get started.</p>
            <Button onClick={() => setIsDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> New Schedule</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map(s => (
            <Card key={s.id} className="group hover:shadow-md transition-shadow relative">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarRange className="h-5 w-5" />
                    </div>
                    <div>
                      <Link to={`/dashboard/schedules/${s.id}`} className="font-semibold text-sm hover:underline">{s.projectName}</Link>
                      <p className="text-xs text-muted-foreground">{s.clientName}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{s.packages?.length || 0} packages</Badge>
                  <span className="text-[10px] text-muted-foreground">{format(ensureDate(s.updatedAt), 'MMM d, yyyy')}</span>
                </div>
                <Link to={`/dashboard/schedules/${s.id}`} className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline">
                  <FolderOpen className="h-3.5 w-3.5" /> Open Schedule
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setConfirmText(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the schedule{' '}
              <strong className="text-foreground">{deleteTarget?.projectName}</strong> and all its package data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="schedule-delete-confirmation">Please type the project name to confirm:</Label>
            <Input
              id="schedule-delete-confirmation"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleteTarget?.projectName || ''}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              asChild
              disabled={confirmText !== deleteTarget?.projectName}
            >
              <Button onClick={handleDelete} variant="destructive">
                Delete Schedule
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
