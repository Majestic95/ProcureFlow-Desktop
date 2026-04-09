import { useState, useMemo } from 'react';
import { collection, query, orderBy, where, limit, startAfter, getDocs, Timestamp } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import AccessDenied from '@/components/auth/access-denied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, ChevronLeft, ChevronRight, Shield, RefreshCw, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface AuditLog {
  id: string;
  action: string;
  category: string;
  targetCollection: string;
  targetDocId: string;
  clientId?: string;
  userId: string;
  userName: string;
  userEmail: string;
  details?: Record<string, any>;
  timestamp: Timestamp | Date;
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'rfp', label: 'RFP' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'user', label: 'User' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'template', label: 'Template' },
  { value: 'portal', label: 'Portal' },
  { value: 'client', label: 'Client' },
];

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-100 text-green-800',
  updated: 'bg-blue-100 text-blue-800',
  deleted: 'bg-red-100 text-red-800',
  awarded: 'bg-amber-100 text-amber-800',
  scored: 'bg-purple-100 text-purple-800',
  ai_analysis: 'bg-indigo-100 text-indigo-800',
  role_changed: 'bg-orange-100 text-orange-800',
  clients_assigned: 'bg-cyan-100 text-cyan-800',
  invited: 'bg-emerald-100 text-emerald-800',
  suppliers_selected: 'bg-teal-100 text-teal-800',
  access_codes_updated: 'bg-yellow-100 text-yellow-800',
  stage_updated: 'bg-blue-100 text-blue-800',
  bulk_imported: 'bg-emerald-100 text-emerald-800',
  prequalification_updated: 'bg-violet-100 text-violet-800',
  proposal_submitted: 'bg-green-100 text-green-800',
  question_asked: 'bg-sky-100 text-sky-800',
};

function getActionColor(action: string): string {
  const key = action.split('.').pop() || '';
  return ACTION_COLORS[key] || 'bg-gray-100 text-gray-800';
}

function getReadableDescription(log: AuditLog): string {
  const d = log.details || {};
  switch (log.action) {
    case 'rfp.created': return `Created RFP "${d.title || '—'}"${d.flowType ? ` (${d.flowType} flow)` : ''}`;
    case 'rfp.updated': return `Updated RFP "${d.title || '—'}"`;
    case 'rfp.deleted': return `Deleted RFP "${d.title || '—'}"`;
    case 'rfp.awarded': return `Awarded RFP "${d.rfpTitle || '—'}" to ${d.supplierName || '—'}`;
    case 'rfp.suppliers_selected': return `Selected suppliers for "${d.rfpTitle || '—'}": ${Array.isArray(d.supplierNames) ? d.supplierNames.join(', ') : '—'}`;
    case 'rfp.access_codes_updated': return `Updated portal access codes for "${d.rfpTitle || '—'}"${d.supplierName ? ` (${d.supplierName})` : ''}`;
    case 'proposal.scored': return `Scored proposal for "${d.rfpTitle || '—'}" — ${d.supplierName || '—'} (final: ${d.finalScore ?? '—'})`;
    case 'proposal.ai_analysis': return `Ran AI analysis on "${d.rfpTitle || '—'}" — ${d.supplierName || '—'}`;
    case 'proposal.created': return `Created proposal for RFP ${d.rfpId || '—'}${d.supplierName ? ` (${d.supplierName})` : ''}`;
    case 'proposal.deleted': return `Deleted proposal from ${d.supplierName || '—'}${d.rfpTitle ? ` for "${d.rfpTitle}"` : ''}`;
    case 'user.role_changed': return `Changed role for ${d.userName || '—'} to ${d.newRole || '—'}`;
    case 'user.clients_assigned': return `Assigned ${d.userName || '—'} to clients: ${Array.isArray(d.clientNames) ? d.clientNames.join(', ') : '—'}`;
    case 'user.invited': return `Invited ${d.email || '—'} as ${d.role || 'viewer'}`;
    case 'supplier.created': return `Registered supplier "${d.companyName || '—'}"`;
    case 'supplier.updated': return `Updated supplier "${d.companyName || '—'}"`;
    case 'supplier.deleted': return `Deleted supplier "${d.companyName || '—'}"`;
    case 'supplier.bulk_imported': return `Bulk imported ${d.count || '—'} suppliers`;
    case 'supplier.prequalification_updated': return `Updated prequalification for supplier${d.section ? ` (${d.section})` : ''}`;
    case 'client.created': return `Created client "${d.clientName || '—'}"`;
    case 'schedule.created': return `Created schedule "${d.projectName || '—'}"`;
    case 'schedule.updated': return `Updated schedule${d.updateType ? ` (${d.updateType})` : ''}`;
    case 'schedule.deleted': return `Deleted schedule "${d.projectName || '—'}"`;
    case 'rfp.stage_updated': return `Updated RFP stage: ${d.stage || '—'}`;
    case 'template.created': return `Created template "${d.name || '—'}"${d.type ? ` (${d.type})` : ''}`;
    case 'template.updated': return `Updated template "${d.name || '—'}"`;
    case 'template.deleted': return `Deleted template "${d.name || '—'}"`;
    case 'portal.proposal_submitted': return `${d.supplierName || 'Supplier'} submitted proposal for "${d.rfpTitle || '—'}" (rev #${d.revision ?? 0})`;
    case 'portal.question_asked': return `${d.supplierName || 'Supplier'} asked a question on "${d.rfpTitle || '—'}"`;
    default: return log.action;
  }
}

function safeFormatDate(date: any): string {
  if (!date) return '—';
  try {
    const d = typeof date.toDate === 'function' ? date.toDate() : new Date(date);
    return isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy h:mm:ss a');
  } catch {
    return '—';
  }
}

const PAGE_SIZE = 25;

export default function AuditTrailPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('');

  // Pagination
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [firstDoc, setFirstDoc] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(log =>
      log.action.toLowerCase().includes(q) ||
      log.userName.toLowerCase().includes(q) ||
      log.targetDocId.toLowerCase().includes(q) ||
      log.targetCollection.toLowerCase().includes(q) ||
      (log.clientId && log.clientId.toLowerCase().includes(q)) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const cats: Record<string, number> = {};
    logs.forEach(l => { cats[l.category] = (cats[l.category] || 0) + 1; });
    return cats;
  }, [logs]);

  if (authLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return <AccessDenied inline />;
  }

  const fetchLogs = async (direction: 'first' | 'next' = 'first') => {
    setIsLoading(true);
    try {
      const constraints: any[] = [orderBy('timestamp', 'desc'), limit(PAGE_SIZE + 1)];

      if (categoryFilter !== 'all') {
        constraints.unshift(where('category', '==', categoryFilter));
      }

      if (userFilter.trim()) {
        constraints.unshift(where('userEmail', '==', userFilter.trim()));
      }

      if (direction === 'next' && lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(collection(db, 'audit_logs'), ...constraints);
      const snapshot = await getDocs(q);

      const results: AuditLog[] = [];
      snapshot.docs.slice(0, PAGE_SIZE).forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as AuditLog);
      });

      setHasMore(snapshot.docs.length > PAGE_SIZE);
      setLogs(results);
      setHasLoaded(true);

      if (results.length > 0) {
        setFirstDoc(snapshot.docs[0]);
        setLastDoc(snapshot.docs[Math.min(snapshot.docs.length - 1, PAGE_SIZE - 1)]);
      }

      if (direction === 'next') {
        setPage(p => p + 1);
      } else {
        setPage(0);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Audit Trail</h1>
              <p className="text-sm text-muted-foreground">Tamper-proof log of all system actions</p>
            </div>
          </div>
        </div>
        <Button onClick={() => fetchLogs('first')} disabled={isLoading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {hasLoaded ? 'Refresh' : 'Load Logs'}
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-none shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions, users, documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by email"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-[220px]"
            />
            <Button onClick={() => fetchLogs('first')} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats bar */}
      {hasLoaded && logs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats).map(([cat, count]) => (
            <Badge key={cat} variant="secondary" className="text-xs">
              {cat}: {count}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">
            Page {page + 1} &middot; {filteredLogs.length} entries shown
          </Badge>
        </div>
      )}

      {/* Table */}
      {!hasLoaded ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Click <strong>Load Logs</strong> to view the audit trail.</p>
          </CardContent>
        </Card>
      ) : filteredLogs.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No audit logs found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[170px]">Timestamp</TableHead>
                <TableHead className="w-[160px]">Action</TableHead>
                <TableHead className="w-[150px]">User</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setSelectedLog(log)}>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {safeFormatDate(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs font-medium ${getActionColor(log.action)}`}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{log.userName}</div>
                    <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{getReadableDescription(log)}</div>
                  </TableCell>
                  <TableCell>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {hasLoaded && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {filteredLogs.length} entries on this page
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || isLoading}
              onClick={() => fetchLogs('first')}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> First
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore || isLoading}
              onClick={() => fetchLogs('next')}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Audit Entry Detail
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Action</div>
                  <Badge className={`${getActionColor(selectedLog.action)}`}>{selectedLog.action}</Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Category</div>
                  <span className="font-medium">{selectedLog.category}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Timestamp</div>
                  <span className="font-mono text-xs">{safeFormatDate(selectedLog.timestamp)}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Client ID</div>
                  <span className="font-mono text-xs">{selectedLog.clientId || '—'}</span>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Performed By</div>
                <div className="text-sm">
                  <span className="font-medium">{selectedLog.userName}</span>
                  <span className="text-muted-foreground"> ({selectedLog.userEmail})</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">UID: {selectedLog.userId}</div>
              </div>

              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Target</div>
                <div className="text-sm">
                  <span className="font-medium">{selectedLog.targetCollection}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="font-mono text-xs">{selectedLog.targetDocId}</span>
                </div>
              </div>

              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Details</div>
                  <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-auto max-h-48">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
