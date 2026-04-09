import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, onSnapshot, query, addDoc, serverTimestamp, orderBy, doc, updateDoc } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { logAudit } from '@/lib/audit';
import type { Schedule, SchedulePackage } from '@/types';
import { MILESTONE_LABELS, MILESTONE_KEYS } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import AccessDenied from '@/components/auth/access-denied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Search, AlertCircle, MessageSquare, Clock, Filter,
  ChevronRight, ExternalLink, MessageCirclePlus, ArrowLeft, Calendar as CalendarIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { isValid, parse, format } from 'date-fns';

// --- Shared Types ---
interface Activity {
  id: string; // scheduleId + packageId + milestoneKey
  scheduleId: string;
  projectName: string;
  clientName: string;
  packageId: string;
  packageName: string;
  milestoneKey: string;
  milestoneLabel: string;
  plannedDate: string;
  forecastDate: string;
  actualDate: string;
  packageComment: string | null;
  commentCount: number;
}

interface ActivityComment {
  id: string;
  activityId: string;
  text: string;
  authorName: string;
  createdAt: any;
}

export default function ActivitiesSummaryPage() {
  const navigate = useNavigate();
  const { isAdmin, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [showOnlyIncompletePlanned, setShowOnlyIncompletePlanned] = useState(true);
  const [packageFilter, setPackageFilter] = useState('all');
  const [milestoneFilter, setMilestoneFilter] = useState('all');
  const [updatingActivity, setUpdatingActivity] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'schedules'), (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch comments when an activity is selected
  useEffect(() => {
    if (!selectedActivity) {
      setComments([]);
      return;
    }
    // For simplicity, we'll fetch once. For real-time, use onSnapshot.
    const q = query(collection(db, 'activityComments'), orderBy('createdAt', 'desc'));
    getDocs(q).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityComment));
      setComments(all.filter(c => c.activityId === selectedActivity.id));
    }).catch(err => console.error('Failed to fetch comments:', err));
  }, [selectedActivity]);

  // Fetch all comment counts for the badges
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activityComments'), (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.activityId) {
          counts[data.activityId] = (counts[data.activityId] || 0) + 1;
        }
      });
      setCommentCounts(counts);
    });
    return () => unsub();
  }, []);

  const allActivities = useMemo(() => {
    const list: Activity[] = [];
    schedules.forEach(schedule => {
      (schedule.packages || []).forEach(pkg => {
        Object.entries(pkg.milestones || {}).forEach(([mKey, mData]) => {
          const mLabel = MILESTONE_LABELS[mKey] || mKey;
          const pDate = (mData as any).plannedDate;
          const fDate = (mData as any).adjustedDate;
          const aDate = (mData as any).actualDate;
          
          if ((pDate && pDate !== 'TBD') || (fDate && fDate !== 'TBD') || (aDate && aDate !== 'TBD')) {
            const id = `${schedule.id}-${pkg.id}-${mKey}`;
            list.push({
              id,
              scheduleId: schedule.id,
              projectName: schedule.projectName,
              clientName: schedule.clientName,
              packageId: pkg.id,
              packageName: pkg.name,
              milestoneKey: mKey,
              milestoneLabel: mLabel,
              plannedDate: pDate || 'TBD',
              forecastDate: fDate || 'TBD',
              actualDate: aDate || 'TBD',
              packageComment: pkg.comment || null,
              commentCount: commentCounts[id] || 0,
            });
          }
        });
      });
    });
    return list;
  }, [schedules, commentCounts]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredActivities = useMemo(() => {
    return allActivities.filter(a => {
      const isComplete = a.actualDate && a.actualDate !== 'TBD' && a.actualDate !== 'N/A';
      
      // Default Filter: Planned activities without actual
      if (showOnlyIncompletePlanned && isComplete) return false;

      // New filters
      if (packageFilter !== 'all' && a.packageName !== packageFilter) return false;
      if (milestoneFilter !== 'all' && a.milestoneKey !== milestoneFilter) return false;

      const dateForFilter = a.actualDate !== 'TBD' ? a.actualDate : (a.forecastDate !== 'TBD' ? a.forecastDate : a.plannedDate);
      const aDate = new Date(dateForFilter);
      const isPast = aDate < today;
      const isUpcoming = aDate >= today && aDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (activeTab === 'upcoming' && !isUpcoming) return false;
      if (activeTab === 'overdue' && !isPast) return false;
      
      if (search) {
        const query = search.toLowerCase();
        return (
          a.projectName.toLowerCase().includes(query) ||
          a.packageName.toLowerCase().includes(query) ||
          a.milestoneLabel.toLowerCase().includes(query)
        );
      }
      return true;
    }).sort((a, b) => {
      const d1 = a.actualDate !== 'TBD' ? a.actualDate : (a.forecastDate !== 'TBD' ? a.forecastDate : a.plannedDate);
      const d2 = b.actualDate !== 'TBD' ? b.actualDate : (b.forecastDate !== 'TBD' ? b.forecastDate : b.plannedDate);
      return new Date(d1).getTime() - new Date(d2).getTime();
    });
  }, [allActivities, activeTab, search, today, showOnlyIncompletePlanned, packageFilter, milestoneFilter]);

  const updateActivityDate = async (activity: Activity, dateType: 'planned' | 'forecast' | 'actual', newValue: string) => {
    const field = dateType === 'planned' ? 'plannedDate' : (dateType === 'forecast' ? 'adjustedDate' : 'actualDate');
    const schedule = schedules.find(s => s.id === activity.scheduleId);
    if (!schedule) return;

    setUpdatingActivity(`${activity.id}-${dateType}`);
    try {
      const nextPkgs = (schedule.packages || []).map(p => {
        if (p.id === activity.packageId) {
          const nextMs = { ...(p.milestones || {}) };
          nextMs[activity.milestoneKey] = { ...(nextMs[activity.milestoneKey] || {}), [field]: newValue };
          return { ...p, milestones: nextMs };
        }
        return p;
      });

      await updateDoc(doc(db, 'schedules', schedule.id), { 
        packages: nextPkgs,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Date updated successfully' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setUpdatingActivity(null);
    }
  };

  const postComment = async () => {
    if (!selectedActivity || !newComment.trim() || !user) return;
    setCommentLoading(true);
    try {
      const ref = await addDoc(collection(db, 'activityComments'), {
        activityId: selectedActivity.id,
        text: newComment.trim(),
        authorName: user.displayName || user.email || 'User',
        authorId: user.uid,
        createdAt: serverTimestamp(),
      });
      logAudit({ action: 'schedule.comment_added', category: 'schedule', targetCollection: 'activityComments', targetDocId: ref.id, details: { activityId: selectedActivity.id } });
      setNewComment('');
      // Refresh comments
      const q = query(collection(db, 'activityComments'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityComment));
      setComments(all.filter(c => c.activityId === selectedActivity.id));
      toast({ title: 'Comment added' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setCommentLoading(false);
    }
  };

  if (authLoading || loading) return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <AccessDenied inline />;

  const getLatestDate = (a: Activity) => a.actualDate !== 'TBD' ? a.actualDate : (a.forecastDate !== 'TBD' ? a.forecastDate : a.plannedDate);

  const DateCell = ({ activity, dateType, value, className }: { 
    activity: Activity; 
    dateType: 'planned' | 'forecast' | 'actual'; 
    value: string;
    className?: string;
  }) => {
    const isTbd = value === 'TBD' || value === 'N/A';
    const parsedDate = isTbd ? null : new Date(value);
    const displayValue = isTbd ? value : format(parsedDate!, 'MM/dd/yy');

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn(
            "w-24 px-1 py-1 text-[10px] tabular-nums hover:bg-muted focus:ring-1 focus:ring-primary rounded transition-all text-center border border-transparent hover:border-border",
            className,
            updatingActivity === `${activity.id}-${dateType}` && "animate-pulse opacity-50"
          )}>
            {displayValue}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <div className="p-2 border-b bg-muted/30 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase">{dateType} Date</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5" onClick={() => updateActivityDate(activity, dateType, 'TBD')}>TBD</Button>
              <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5" onClick={() => updateActivityDate(activity, dateType, 'N/A')}>N/A</Button>
            </div>
          </div>
          <Calendar
            mode="single"
            selected={parsedDate && isValid(parsedDate) ? parsedDate : undefined}
            onSelect={(date) => date && updateActivityDate(activity, dateType, format(date, 'yyyy-MM-dd'))}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Activities Summary</h1>
          <p className="text-muted-foreground">Track upcoming and overdue milestones across all schedules.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList>
            <TabsTrigger value="upcoming" className="gap-2">
              <Clock className="h-4 w-4" /> Upcoming <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{allActivities.filter(a => { const d = new Date(getLatestDate(a)); return d >= today && d <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); }).length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" /> Overdue <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{allActivities.filter(a => new Date(getLatestDate(a)) < today && a.actualDate === 'TBD').length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all">All Activities</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3 flex-wrap bg-muted/20 p-3 rounded-lg border">
          <Button 
            variant={showOnlyIncompletePlanned ? 'default' : 'outline'} 
            size="sm" 
            className="h-9 gap-2"
            onClick={() => setShowOnlyIncompletePlanned(!showOnlyIncompletePlanned)}
          >
            <Filter className={cn("h-4 w-4", showOnlyIncompletePlanned && "fill-current")} />
            {showOnlyIncompletePlanned ? 'Incomplete Planned' : 'Show All'}
          </Button>

          <div className="h-6 w-px bg-border hidden sm:block mx-1" />

          {/* Package Filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Package:</span>
            <select 
              className="bg-background border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary min-w-[120px]"
              value={packageFilter}
              onChange={e => setPackageFilter(e.target.value)}
            >
              <option value="all">All Packages</option>
              {Array.from(new Set(allActivities.map(a => a.packageName))).sort().map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Milestone Filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Milestone:</span>
            <select 
              className="bg-background border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary min-w-[120px]"
              value={milestoneFilter}
              onChange={e => setMilestoneFilter(e.target.value)}
            >
              <option value="all">All Milestones</option>
              {Array.from(new Set(allActivities.map(a => a.milestoneKey))).sort().map(key => (
                <option key={key} value={key}>{MILESTONE_LABELS[key] || key}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Project / Package</th>
                <th className="px-4 py-3 text-left font-medium">Activity</th>
                <th className="px-4 py-3 text-center font-medium">Planned</th>
                <th className="px-4 py-3 text-center font-medium">Forecast</th>
                <th className="px-4 py-3 text-center font-medium">Actual</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>No activities found for this filter.</p>
                  </td>
                </tr>
              ) : filteredActivities.map(activity => {
                const latestDate = activity.actualDate !== 'TBD' ? activity.actualDate : (activity.forecastDate !== 'TBD' ? activity.forecastDate : activity.plannedDate);
                const isOverdue = new Date(latestDate) < today && activity.actualDate === 'TBD';
                
                return (
                  <tr key={activity.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{activity.projectName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{activity.packageName}</span>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{activity.clientName}</span>
                        </div>
                        {activity.packageComment && (
                          <div className="flex items-start gap-1.5 mt-1.5 p-1.5 bg-primary/5 rounded border border-primary/10 max-w-[300px]">
                            <MessageSquare className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                            <p className="text-[10px] text-primary/80 leading-tight italic">{activity.packageComment}</p>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-normal capitalize">{activity.milestoneLabel}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                       <DateCell 
                         activity={activity} 
                         dateType="planned" 
                         value={activity.plannedDate} 
                       />
                    </td>
                    <td className="px-4 py-3 text-center">
                       <DateCell 
                         activity={activity} 
                         dateType="forecast" 
                         value={activity.forecastDate} 
                         className="text-sky-600 font-bold"
                       />
                    </td>
                    <td className="px-4 py-3 text-center">
                       <DateCell 
                         activity={activity} 
                         dateType="actual" 
                         value={activity.actualDate} 
                         className={cn(
                           "border-dashed border rounded-full font-bold",
                           activity.actualDate !== 'TBD' ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground"
                         )}
                       />
                       {isOverdue && <div className="text-[8px] text-destructive font-bold uppercase mt-0.5">Overdue</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={() => setSelectedActivity(activity)}>
                          <MessageSquare className="h-4 w-4" />
                          {activity.commentCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-white text-[8px] font-bold h-3.5 w-3.5 flex items-center justify-center rounded-full border border-background shadow-sm">
                              {activity.commentCount}
                            </span>
                          )}
                        </Button>
                        <Link to={`/dashboard/schedules/${activity.scheduleId}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comment Dialog */}
      <Dialog open={!!selectedActivity} onOpenChange={open => !open && setSelectedActivity(null)}>
        <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>Activity Trackability</DialogTitle>
            <DialogDescription>
              Discussion and notes for {selectedActivity?.milestoneLabel} in {selectedActivity?.projectName}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-6 pt-2">
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No comments yet. Start the conversation!</p>
                  </div>
                ) : comments.map(comment => (
                  <div key={comment.id} className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold">{comment.authorName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {comment.createdAt?.toDate?.() ? comment.createdAt.toDate().toLocaleString() : 'Just now'}
                      </span>
                    </div>
                    <p className="text-sm">{comment.text}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-muted/20">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a comment or action item..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && postComment()}
                  disabled={commentLoading}
                />
                <Button size="icon" onClick={postComment} disabled={!newComment.trim() || commentLoading}>
                  {commentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCirclePlus className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
