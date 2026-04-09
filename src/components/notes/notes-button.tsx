import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "@/lib/firestore-compat";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { NotesPanel } from "./notes-panel";

interface NotesButtonProps {
  entityType: "project" | "supplier" | "rfp";
  entityId: string;
  entityName: string;
  currentTab?: string;
  currentTabLabel?: string;
}

export function NotesButton({
  entityType,
  entityId,
  entityName,
  currentTab,
  currentTabLabel,
}: NotesButtonProps) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "notes"),
      where("entityType", "==", entityType),
      where("entityId", "==", entityId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const topLevel = snap.docs.filter(d => !d.data().parentId).length;
      setCount(topLevel);
    }, (err) => { console.error('[NotesButton] listener error:', err); });
    return unsub;
  }, [entityType, entityId]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4 mr-1" />
        Notes
        <Badge
          variant={count > 0 ? "default" : "secondary"}
          className="ml-1.5 px-1.5 py-0 text-xs min-w-[1.25rem] justify-center"
        >
          {count}
        </Badge>
      </Button>

      <NotesPanel
        open={open}
        onOpenChange={setOpen}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        currentTab={currentTab}
        currentTabLabel={currentTabLabel}
      />
    </>
  );
}
