import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc, serverTimestamp } from '@/lib/firestore-compat';
import { db, auth } from '@/lib/firebase';
import type { Project, Client } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, FolderKanban, Loader2, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { ensureDate } from '@/lib/utils';
import { PROJECT_STATUS_COLORS } from '@/lib/colors';

export default function ProjectsPage() {
  const { isAdmin, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClientId, setNewClientId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // Load projects
  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        } as Project;
      });
      // Non-admin users: filter to accessible clients
      if (profile && !isAdmin && profile.clientIds?.length) {
        setProjects(all.filter(p => profile.clientIds.includes(p.clientId)));
      } else {
        setProjects(all);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [isAdmin, profile]);

  // Load clients for the dialog
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });
    return () => unsub();
  }, []);

  async function handleCreate() {
    if (!newClientId || !newName.trim()) return;
    setCreating(true);
    const client = clients.find(c => c.id === newClientId);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        clientId: newClientId,
        clientName: client?.name || '',
        name: newName.trim(),
        description: newDescription.trim() || '',
        status: 'active',
        createdBy: auth.currentUser?.uid || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      logAudit({ action: 'project.created', category: 'client', targetCollection: 'projects', targetDocId: docRef.id, clientId: newClientId, details: { name: newName } });
      toast({ title: 'Project Created', description: `"${newName.trim()}" has been created.` });
      setIsDialogOpen(false);
      setNewClientId('');
      setNewName('');
      setNewDescription('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'projects', deleteTarget.id));
      logAudit({ action: 'project.deleted', category: 'client', targetCollection: 'projects', targetDocId: deleteTarget.id, clientId: deleteTarget.clientId, details: { name: deleteTarget.name } });
      toast({ title: 'Project Deleted' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
    setDeleteTarget(null);
  }

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage procurement projects and equipment packages.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1.5 h-4 w-4" /> Add Project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
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
                <Input placeholder="e.g., Data Center Phase 2" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea placeholder="Brief project description..." value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !newClientId || !newName.trim()}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Projects Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first project to get started.</p>
            <Button onClick={() => setIsDialogOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add Project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <Card key={p.id} className="group hover:shadow-md transition-shadow relative">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div>
                      <Link to={`/dashboard/projects/${p.id}`} className="font-semibold text-sm hover:underline">{p.name}</Link>
                      <p className="text-xs text-muted-foreground">{p.clientName}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-xs ${PROJECT_STATUS_COLORS[p.status] || ''}`}>{p.status}</Badge>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(ensureDate(p.updatedAt), 'MMM d, yyyy')}
                  </span>
                </div>
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
              This action cannot be undone. This will permanently delete the project{' '}
              <strong className="text-foreground">{deleteTarget?.name}</strong> and unlink any associated RFPs or schedules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="project-delete-confirmation">Please type the project name to confirm:</Label>
            <Input
              id="project-delete-confirmation"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleteTarget?.name || ''}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              asChild
              disabled={confirmText !== deleteTarget?.name}
            >
              <Button onClick={handleDelete} variant="destructive">
                Delete Project
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
