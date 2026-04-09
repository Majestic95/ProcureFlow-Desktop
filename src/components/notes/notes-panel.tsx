import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  serverTimestamp,
} from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { ensureDate, relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Pin,
  PinOff,
  Trash2,
  Reply,
  Send,
  MessageSquare,
} from 'lucide-react';
import MentionAutocomplete, { type MentionResult } from './mention-autocomplete';
import { MentionText } from './mention-renderer';
import type { Note, NoteEntityType } from '@/types';

interface NotesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: NoteEntityType;
  entityId: string;
  entityName: string;
  currentTab?: string;
  currentTabLabel?: string;
  onNoteCount?: (count: number) => void;
}

export function NotesPanel({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  currentTab,
  currentTabLabel,
  onNoteCount,
}: NotesPanelProps) {
  const { user, profile, isAdmin } = useAuth();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [newText, setNewText] = useState('');
  const [pinNew, setPinNew] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  // Maps display shorthand → full token for mentions (e.g., "@Project Indy → Schedule" → "@[Project Indy → Schedule](/dashboard/...)")
  const mentionMapRef = useRef<Map<string, string>>(new Map());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
  const [mentionTarget, setMentionTarget] = useState<'new' | 'reply'>('new');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!entityId) return;
    const q = query(
      collection(db, 'notes'),
      where('entityType', '==', entityType),
      where('entityId', '==', entityId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Note));
      setNotes(list);
      onNoteCount?.(list.filter((n) => !n.parentId).length);
    }, (err) => { console.error('[NotesPanel] listener error:', err); });
    return unsub;
  }, [entityType, entityId, onNoteCount]);

  const topLevel = notes
    .filter((n) => !n.parentId)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return ensureDate(b.createdAt).getTime() - ensureDate(a.createdAt).getTime();
    });

  const repliesFor = useCallback(
    (parentId: string) =>
      notes
        .filter((n) => n.parentId === parentId)
        .sort(
          (a, b) =>
            ensureDate(a.createdAt).getTime() - ensureDate(b.createdAt).getTime(),
        ),
    [notes],
  );

  const authorName =
    profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Unknown';
  const authorId = user?.uid || '';

  const canModify = (note: Note) =>
    isAdmin || note.authorId === authorId;

  async function handleAddNote() {
    const text = resolveTokens(newText.trim());
    if (!text || !authorId) return;
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'notes'), {
        entityType,
        entityId,
        entityName,
        tab: currentTab || null,
        tabLabel: currentTabLabel || null,
        authorId,
        authorName,
        text,
        pinned: pinNew,
        parentId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAudit({
        action: 'note.created',
        category: 'note',
        targetCollection: 'notes',
        targetDocId: ref.id,
        details: { entityType, entityId, entityName },
      });
      setNewText('');
      setPinNew(false);
      mentionMapRef.current.clear();
    } catch (err) {
      console.error('[notes] create failed:', err);
      toast({ variant: 'destructive', title: 'Failed to add note' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(parentId: string) {
    const text = resolveTokens(replyText.trim());
    if (!text || !authorId) return;
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'notes'), {
        entityType,
        entityId,
        entityName,
        tab: currentTab || null,
        tabLabel: currentTabLabel || null,
        authorId,
        authorName,
        text,
        pinned: false,
        parentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAudit({
        action: 'note.created',
        category: 'note',
        targetCollection: 'notes',
        targetDocId: ref.id,
        details: { entityType, entityId, parentId },
      });
      setReplyText('');
      setReplyingTo(null);
    } catch (err) {
      console.error('[notes] reply failed:', err);
      toast({ variant: 'destructive', title: 'Failed to add reply' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePin(note: Note) {
    if (!canModify(note)) return;
    const newPinned = !note.pinned;
    try {
      await updateDoc(doc(db, 'notes', note.id), {
        pinned: newPinned,
        updatedAt: serverTimestamp(),
      });
      await logAudit({
        action: 'note.pinned',
        category: 'note',
        targetCollection: 'notes',
        targetDocId: note.id,
        details: { pinned: newPinned },
      });
    } catch (err) {
      console.error('[notes] pin toggle failed:', err);
      toast({ variant: 'destructive', title: 'Failed to update pin' });
    }
  }

  async function handleDelete(note: Note) {
    if (!canModify(note)) return;
    try {
      await deleteDoc(doc(db, 'notes', note.id));
      // Cascade delete child replies via Firestore query (not in-memory state)
      const childSnap = await getDocs(query(collection(db, 'notes'), where('parentId', '==', note.id)));
      for (const childDoc of childSnap.docs) {
        await deleteDoc(childDoc.ref);
      }
      await logAudit({
        action: 'note.deleted',
        category: 'note',
        targetCollection: 'notes',
        targetDocId: note.id,
        details: { entityType, entityId },
      });
      toast({ title: 'Note deleted' });
    } catch (err) {
      console.error('[notes] delete failed:', err);
      toast({ variant: 'destructive', title: 'Failed to delete note' });
    } finally {
      setConfirmDelete(null);
    }
  }

  /** Convert display shorthand (@Entity Name) back to full tokens before saving */
  function resolveTokens(text: string): string {
    let resolved = text;
    mentionMapRef.current.forEach((fullToken, shorthand) => {
      // Replace all occurrences of the shorthand with the full token
      while (resolved.includes(shorthand)) {
        resolved = resolved.replace(shorthand, fullToken);
      }
    });
    return resolved;
  }

  function handleTextChange(value: string, target: 'new' | 'reply') {
    if (target === 'new') setNewText(value);
    else setReplyText(value);

    const textarea = target === 'new' ? textareaRef.current : replyTextareaRef.current;
    if (!textarea) return;

    // Use value length as cursor position fallback (cursor is typically at end after typing)
    const cursorPos = textarea.selectionStart ?? value.length;
    const textBefore = value.slice(0, cursorPos);
    const lastAt = textBefore.lastIndexOf('@');

    if (lastAt >= 0 && (lastAt === 0 || /[\s\n]/.test(textBefore[lastAt - 1]))) {
      const afterAt = textBefore.slice(lastAt + 1);
      // Only show if no closing pattern found (not already a completed mention)
      if (!afterAt.includes(')') && afterAt.length <= 40) {
        setMentionQuery(afterAt);
        setMentionTarget(target);
        setShowMention(true);
        const rect = textarea.getBoundingClientRect();
        setMentionPos({ top: rect.bottom + 4, left: rect.left });
        return;
      }
    }
    setShowMention(false);
  }

  function handleMentionSelect(mention: MentionResult) {
    const target = mentionTarget;
    const currentText = target === 'new' ? newText : replyText;
    const textarea = target === 'new' ? textareaRef.current : replyTextareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart ?? currentText.length;
    const textBefore = currentText.slice(0, cursorPos);
    const lastAt = textBefore.lastIndexOf('@');

    // Build the full token (stored in Firestore)
    const clientPart = mention.clientId ? `|clientId:${mention.clientId}` : '';
    const safeDisplay = mention.displayText.replace(/\]/g, '\\]');
    const safeUrl = mention.url.replace(/\)/g, '%29');
    const fullToken = `@[${safeDisplay}](${safeUrl}${clientPart})`;

    // Display shorthand (shown in textarea)
    const shorthand = `@${mention.displayText}`;

    // Store mapping so we can reconstruct full tokens before saving
    mentionMapRef.current.set(shorthand, fullToken);

    // Insert clean display text into textarea
    const newValue = currentText.slice(0, lastAt) + shorthand + ' ' + currentText.slice(cursorPos);

    if (target === 'new') setNewText(newValue);
    else setReplyText(newValue);

    setShowMention(false);
  }

  function handleTabClick(tab: string) {
    window.location.hash = '#' + tab;
  }

  function NoteRow({ note, isReply }: { note: Note; isReply?: boolean }) {
    const ts = ensureDate(note.createdAt);
    return (
      <div
        className={`group relative py-3 ${
          isReply ? 'ml-6 border-l-2 border-muted pl-4' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{note.authorName}</span>
          <span className="text-muted-foreground text-xs" title={ts.toLocaleString()}>
            {relativeTime(ts)}
          </span>
          {note.pinned && (
            <Pin className="h-3 w-3 text-primary fill-primary" />
          )}
          {note.tabLabel && note.tab && (
            <Badge
              variant="default"
              className="cursor-pointer text-[10px] px-1.5 py-0"
              onClick={() => handleTabClick(note.tab!)}
            >
              {note.tabLabel}
            </Badge>
          )}
        </div>

        {/* Body */}
        <p className="mt-1 text-sm whitespace-pre-wrap">
          <MentionText
            text={note.text}
            profile={profile}
            isAdmin={isAdmin}
            toast={toast}
            onClosePanel={() => onOpenChange(false)}
          />
        </p>

        {/* Actions */}
        <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isReply && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setReplyingTo(replyingTo === note.id ? null : note.id);
                setReplyText('');
              }}
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
          )}
          {!isReply && canModify(note) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => handleTogglePin(note)}
            >
              {note.pinned ? (
                <PinOff className="h-3 w-3" />
              ) : (
                <Pin className="h-3 w-3" />
              )}
            </Button>
          )}
          {canModify(note) && (
            <>
              {confirmDelete === note.id ? (
                <div className="flex items-center gap-1 ml-1">
                  <span className="text-xs text-destructive">Delete?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleDelete(note)}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setConfirmDelete(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive"
                  onClick={() => setConfirmDelete(note.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Inline reply input */}
        {!isReply && replyingTo === note.id && (
          <div className="mt-2 flex gap-2">
            <Textarea
              ref={replyTextareaRef}
              className="min-h-[60px] text-sm flex-1"
              placeholder="Write a reply... (type @ to mention)"
              value={replyText}
              onChange={(e) => handleTextChange(e.target.value, 'reply')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleReply(note.id);
                }
                if (e.key === 'Escape' && showMention) {
                  setShowMention(false);
                  e.stopPropagation();
                }
              }}
            />
            {showMention && mentionTarget === 'reply' && (
              <MentionAutocomplete
                query={mentionQuery}
                onSelect={handleMentionSelect}
                onClose={() => setShowMention(false)}
                position={mentionPos}
              />
            )}
            <Button
              size="sm"
              className="h-auto"
              disabled={!replyText.trim() || submitting}
              onClick={() => handleReply(note.id)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-2 border-b">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Notes
            {topLevel.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {topLevel.length}
              </Badge>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground truncate">{entityName}</p>
        </SheetHeader>

        {/* New note input */}
        <div className="px-6 py-4 border-b space-y-2">
          <Textarea
            ref={textareaRef}
            className="min-h-[80px] text-sm"
            placeholder="Add a note... (type @ to mention)"
            value={newText}
            onChange={(e) => handleTextChange(e.target.value, 'new')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleAddNote();
              }
              if (e.key === 'Escape' && showMention) {
                setShowMention(false);
                e.stopPropagation();
              }
            }}
          />
          {showMention && mentionTarget === 'new' && (
            <MentionAutocomplete
              query={mentionQuery}
              onSelect={handleMentionSelect}
              onClose={() => setShowMention(false)}
              position={mentionPos}
            />
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinNew}
                onChange={(e) => setPinNew(e.target.checked)}
                className="rounded border-input"
              />
              Pin this note
            </label>
            <Button
              size="sm"
              disabled={!newText.trim() || submitting}
              onClick={handleAddNote}
            >
              <Send className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-6">
          {topLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
              No notes yet
            </div>
          ) : (
            <div className="divide-y">
              {topLevel.map((note) => (
                <div key={note.id}>
                  <NoteRow note={note} />
                  {repliesFor(note.id).map((reply) => (
                    <NoteRow key={reply.id} note={reply} isReply />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
