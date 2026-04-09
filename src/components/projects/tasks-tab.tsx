import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import type { ProjectTodo, TodoStatus, EquipmentPackage } from '@/types';
import { db, auth } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp,
} from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { ensureDate } from '@/lib/utils';
import { TODO_STATUS_COLORS } from '@/lib/colors';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';

interface TasksTabProps {
  projectId: string;
  clientId: string;
  packages: EquipmentPackage[];
  canEdit: boolean;
}

const STATUS_OPTIONS: { value: TodoStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const FILTER_TABS: { value: TodoStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

type FormData = {
  description: string;
  packageId: string;
  vendorName: string;
  assignedTo: string;
  status: TodoStatus;
  projectedClosure: string;
  actualClosure: string;
  comments: string;
};

const emptyForm: FormData = {
  description: '', packageId: '', vendorName: '', assignedTo: '',
  status: 'open', projectedClosure: '', actualClosure: '', comments: '',
};

export function TasksTab({ projectId, clientId, packages, canEdit }: TasksTabProps) {
  const { toast } = useToast();
  const [todos, setTodos] = useState<ProjectTodo[]>([]);
  const [filter, setFilter] = useState<TodoStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTodo, setEditTodo] = useState<ProjectTodo | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Real-time listener
  useEffect(() => {
    const q = query(
      collection(db, 'projects', projectId, 'todos'),
      orderBy('taskNumber', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectTodo)));
    }, (err) => { console.error('[TasksTab] listener error:', err); });
    return unsub;
  }, [projectId]);

  // Filtered + searched list
  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return todos.filter((t) => {
      if (!showArchived && t.archived) return false;
      if (filter !== 'all' && t.status !== filter) return false;
      if (lc && !t.description.toLowerCase().includes(lc)
        && !t.assignedTo?.toLowerCase().includes(lc)
        && !(t.packageName ?? '').toLowerCase().includes(lc)) return false;
      return true;
    });
  }, [todos, filter, search, showArchived]);

  // Counts per status (non-archived)
  const counts = useMemo(() => {
    const active = todos.filter((t) => !t.archived);
    return {
      all: active.length,
      open: active.filter((t) => t.status === 'open').length,
      'in-progress': active.filter((t) => t.status === 'in-progress').length,
      done: active.filter((t) => t.status === 'done').length,
    };
  }, [todos]);

  const pkgMap = useMemo(() => Object.fromEntries(packages.map((p) => [p.id, p.name])), [packages]);

  const setField = (k: keyof FormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // --- Create ---
  const openCreate = () => { setForm(emptyForm); setCreateOpen(true); };

  const handleCreate = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      const taskNumber = todos.length > 0 ? Math.max(...todos.map(t => t.taskNumber)) + 1 : 1;
      const pkg = packages.find((p) => p.id === form.packageId);
      const data: Record<string, any> = {
        taskNumber,
        description: form.description.trim(),
        assignedTo: form.assignedTo.trim(),
        status: 'open' as TodoStatus,
        archived: false,
        createdBy: auth.currentUser?.email || 'unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (form.packageId) { data.packageId = form.packageId; data.packageName = pkg?.name || ''; }
      if (form.vendorName.trim()) data.vendorName = form.vendorName.trim();
      if (form.projectedClosure) data.projectedClosure = form.projectedClosure;

      const ref = await addDoc(collection(db, 'projects', projectId, 'todos'), data);
      await logAudit({ action: 'todo.created', category: 'schedule', targetCollection: `projects/${projectId}/todos`, targetDocId: ref.id, clientId, details: { taskNumber, description: data.description } });
      toast({ title: 'Task created' });
      setCreateOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // --- Edit ---
  const openEdit = (t: ProjectTodo) => {
    setForm({
      description: t.description, packageId: t.packageId || '', vendorName: t.vendorName || '',
      assignedTo: t.assignedTo || '', status: t.status, projectedClosure: t.projectedClosure || '',
      actualClosure: t.actualClosure || '', comments: t.comments || '',
    });
    setEditTodo(t);
  };

  const handleUpdate = async () => {
    if (!editTodo || !form.description.trim()) return;
    setSaving(true);
    try {
      const ref = doc(db, 'projects', projectId, 'todos', editTodo.id);
      const pkg = packages.find((p) => p.id === form.packageId);
      const updates: Record<string, any> = {
        description: form.description.trim(),
        assignedTo: form.assignedTo.trim(),
        status: form.status,
        vendorName: form.vendorName.trim() || null,
        packageId: form.packageId || null,
        packageName: form.packageId ? (pkg?.name || '') : null,
        projectedClosure: form.projectedClosure || null,
        actualClosure: form.actualClosure || null,
        comments: form.comments.trim() || null,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(ref, updates);

      const statusChanged = form.status !== editTodo.status;
      await logAudit({
        action: statusChanged ? 'todo.status_changed' : 'todo.updated',
        category: 'schedule', targetCollection: `projects/${projectId}/todos`,
        targetDocId: editTodo.id, clientId,
        details: statusChanged
          ? { taskNumber: editTodo.taskNumber, from: editTodo.status, to: form.status }
          : { taskNumber: editTodo.taskNumber },
      });
      toast({ title: 'Task updated' });
      setEditTodo(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggleArchive = async (t: ProjectTodo) => {
    try {
      const ref = doc(db, 'projects', projectId, 'todos', t.id);
      await updateDoc(ref, { archived: !t.archived, updatedAt: serverTimestamp() });
      await logAudit({ action: 'todo.updated', category: 'schedule', targetCollection: `projects/${projectId}/todos`, targetDocId: t.id, clientId, details: { taskNumber: t.taskNumber, archived: !t.archived } });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // --- Form fields shared between create/edit ---
  const renderFields = (isEdit: boolean) => (
    <div className="grid gap-4 py-2">
      <div>
        <Label>Description *</Label>
        <Textarea value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Task description" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Package</Label>
          <Select value={form.packageId} onValueChange={(v) => setField('packageId', v)}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Vendor</Label>
          <Input value={form.vendorName} onChange={(e) => setField('vendorName', e.target.value)} placeholder="Vendor name" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Assigned To</Label>
          <Input value={form.assignedTo} onChange={(e) => setField('assignedTo', e.target.value)} placeholder="Name" />
        </div>
        {isEdit && (
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setField('status', v as TodoStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Projected Closure</Label>
          <Input type="date" value={form.projectedClosure} onChange={(e) => setField('projectedClosure', e.target.value)} />
        </div>
        {isEdit && (
          <div>
            <Label>Actual Closure</Label>
            <Input type="date" value={form.actualClosure} onChange={(e) => setField('actualClosure', e.target.value)} />
          </div>
        )}
      </div>
      {isEdit && (
        <div>
          <Label>Comments</Label>
          <Textarea value={form.comments} onChange={(e) => setField('comments', e.target.value)} placeholder="Comments" rows={2} />
        </div>
      )}
    </div>
  );

  const fmtDate = (d?: string) => d ? format(new Date(d), 'MMM d, yyyy') : '—';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> Add Task</Button>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 w-56" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto" />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b">
        {FILTER_TABS.map((t) => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${filter === t.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label} <span className="ml-1 text-xs text-muted-foreground">({counts[t.value]})</span>
          </button>
        ))}
        <Button variant={showArchived ? 'default' : 'outline'} size="sm" className="h-7 text-xs ml-2" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Task #</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="min-w-[200px]">Description</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Projected</TableHead>
              <TableHead>Actual</TableHead>
              {canEdit && <TableHead className="w-20">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={canEdit ? 9 : 8} className="text-center text-muted-foreground py-8">No tasks found</TableCell></TableRow>
            )}
            {filtered.map((t) => (
              <TableRow key={t.id} className={`cursor-pointer ${t.archived ? 'opacity-50' : ''}`} onClick={() => canEdit && openEdit(t)}>
                <TableCell className="font-mono">{t.taskNumber}</TableCell>
                <TableCell>{t.packageName || '—'}</TableCell>
                <TableCell>{t.vendorName || '—'}</TableCell>
                <TableCell className="max-w-[300px] truncate">{t.description}</TableCell>
                <TableCell>{t.assignedTo || '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={TODO_STATUS_COLORS[t.status]}>{t.status}</Badge>
                </TableCell>
                <TableCell>{fmtDate(t.projectedClosure)}</TableCell>
                <TableCell>{fmtDate(t.actualClosure)}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); toggleArchive(t); }}>
                      {t.archived ? 'Restore' : 'Archive'}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          {renderFields(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.description.trim()}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTodo} onOpenChange={(open) => { if (!open) setEditTodo(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task #{editTodo?.taskNumber}</DialogTitle></DialogHeader>
          {renderFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTodo(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving || !form.description.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
