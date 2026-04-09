import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { RFP } from '@/types';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, getDocs, updateDoc, doc, serverTimestamp,
} from '@/lib/firestore-compat';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { ensureDate } from '@/lib/utils';

import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RFP_STATUS_COLORS } from '@/lib/colors';

interface RfpsTabProps {
  projectId: string;
  clientId: string;
  canEdit: boolean;
}

export default function RfpsTab({ projectId, clientId, canEdit }: RfpsTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rfps, setRfps] = useState<RFP[]>([]);
  const [unlinked, setUnlinked] = useState<RFP[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  // Real-time listener for linked RFPs
  useEffect(() => {
    const q = query(collection(db, 'rfps'), where('projectId', '==', projectId));
    const unsub = onSnapshot(q, (snap) => {
      setRfps(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RFP)));
    }, (err) => { console.error('[RfpsTab] listener error:', err); });
    return unsub;
  }, [projectId]);

  // Fetch unlinked RFPs when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    const q = query(collection(db, 'rfps'), where('clientId', '==', clientId));
    getDocs(q).then((snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RFP));
      setUnlinked(all.filter((r) => !r.projectId));
      setSelected(new Set());
    });
  }, [dialogOpen, clientId]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const linkSelected = async () => {
    setLinking(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map(async (rfpId) => {
          await updateDoc(doc(db, 'rfps', rfpId), { projectId, updatedAt: serverTimestamp() });
          logAudit({
            action: 'rfp.linked_to_project',
            category: 'rfp',
            targetCollection: 'rfps',
            targetDocId: rfpId,
            clientId,
            details: { projectId },
          });
          return rfpId;
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast({
          variant: 'destructive',
          title: 'Partial failure',
          description: `${failed} RFP(s) failed to link. ${selected.size - failed} succeeded.`,
        });
      } else {
        toast({ title: 'RFPs linked', description: `${selected.size} RFP(s) linked to project.` });
      }
      setDialogOpen(false);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to link RFPs.', variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>RFPs</CardTitle>
        {canEdit && <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate(`/dashboard/rfps/new?projectId=${projectId}&clientId=${clientId}`)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add RFP
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm">Link Existing RFP</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link Existing RFPs</DialogTitle>
            </DialogHeader>
            {unlinked.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                All RFPs for this client are already linked to a project. Create a new RFP to link it here.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 py-2">
                {unlinked.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                    <span className="text-sm">{r.title}</span>
                    <Badge variant="secondary" className={`ml-auto ${RFP_STATUS_COLORS[r.status] ?? ''}`}>{r.status}</Badge>
                  </label>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button disabled={selected.size === 0 || linking} onClick={linkSelected}>
                {linking ? 'Linking...' : `Link Selected (${selected.size})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>}
      </CardHeader>
      <CardContent>
        {rfps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No RFPs linked to this project yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Flow Type</TableHead>
                <TableHead>Packages</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfps.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link to={`/dashboard/rfps/${r.id}`} className="text-primary hover:underline">
                      {r.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={RFP_STATUS_COLORS[r.status] ?? ''}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{r.flowType}</TableCell>
                  <TableCell>{r.packageIds?.length ?? 0}</TableCell>
                  <TableCell>{format(ensureDate(r.createdAt), 'MMM d, yyyy')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
