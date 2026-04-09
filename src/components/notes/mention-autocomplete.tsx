import { useEffect, useState, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query as firestoreQuery, limit, orderBy } from "@/lib/firestore-compat";
import { FolderKanban, Users, FileText } from "lucide-react";
import type { Project, Supplier, RFP } from "@/types";

export interface MentionResult {
  displayText: string;
  url: string;
  clientId?: string;
}

interface MentionAutocompleteProps {
  query: string;
  onSelect: (mention: MentionResult) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

type EntityType = "project" | "supplier" | "rfp";

interface SearchResult {
  id: string;
  name: string;
  type: EntityType;
  clientId?: string;
}

const PROJECT_TABS = [
  { label: "Overview", hash: "overview" },
  { label: "Schedule", hash: "schedule" },
  { label: "RFPs", hash: "rfps" },
  { label: "Financials", hash: "financials" },
  { label: "Deliveries", hash: "deliveries" },
  { label: "Contracts", hash: "contracts" },
  { label: "Risks", hash: "risks" },
  { label: "Q&A", hash: "qa" },
  { label: "Tasks", hash: "tasks" },
] as const;

const TYPE_ICON: Record<EntityType, typeof FolderKanban> = {
  project: FolderKanban,
  supplier: Users,
  rfp: FileText,
};

const TYPE_LABEL: Record<EntityType, string> = {
  project: "PROJECTS",
  supplier: "SUPPLIERS",
  rfp: "RFPS",
};

export default function MentionAutocomplete({
  query,
  onSelect,
  onClose,
  position,
}: MentionAutocompleteProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pickerProject, setPickerProject] = useState<SearchResult | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch and filter entities (empty query = show all)
  useEffect(() => {
    let cancelled = false;
    const q = query.toLowerCase();

    async function search() {
      try {
        const [projectSnap, supplierSnap, rfpSnap] = await Promise.all([
          getDocs(firestoreQuery(collection(db, "projects"), orderBy("name"), limit(50))),
          getDocs(firestoreQuery(collection(db, "suppliers"), orderBy("companyName"), limit(50))),
          getDocs(firestoreQuery(collection(db, "rfps"), orderBy("title"), limit(50))),
        ]);

        if (cancelled) return;

        const projects: SearchResult[] = projectSnap.docs
          .filter((d) => ((d.data() as Project).name || '').toLowerCase().includes(q))
          .slice(0, 4)
          .map((d) => { const p = d.data() as Project; return { id: d.id, name: p.name, type: 'project' as const, clientId: p.clientId }; });

        const suppliers: SearchResult[] = supplierSnap.docs
          .filter((d) => ((d.data() as Supplier).companyName || '').toLowerCase().includes(q))
          .slice(0, 3)
          .map((d) => { const s = d.data() as Supplier; return { id: d.id, name: s.companyName, type: 'supplier' as const }; });

        const rfps: SearchResult[] = rfpSnap.docs
          .filter((d) => ((d.data() as RFP).title || '').toLowerCase().includes(q))
          .slice(0, 3)
          .map((d) => { const r = d.data() as RFP; return { id: d.id, name: r.title, type: 'rfp' as const, clientId: r.clientId }; });

        if (!cancelled) {
          setResults([...projects, ...suppliers, ...rfps]);
          setSelectedIndex(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
    }

    search();
    return () => { cancelled = true; };
  }, [query]);

  // Handle entity selection
  const handleSelect = useCallback(
    (item: SearchResult) => {
      if (item.type === "project") {
        setPickerProject(item);
        setTabIndex(0);
        return;
      }
      const url =
        item.type === "supplier"
          ? `/dashboard/suppliers/${item.id}`
          : `/dashboard/rfps/${item.id}`;
      onSelect({ displayText: item.name, url, clientId: item.clientId });
    },
    [onSelect],
  );

  // Handle tab selection for projects
  const handleTabSelect = useCallback(
    (tab: (typeof PROJECT_TABS)[number]) => {
      if (!pickerProject) return;
      onSelect({
        displayText: `${pickerProject.name} \u2192 ${tab.label}`,
        url: `/dashboard/projects/${pickerProject.id}#${tab.hash}`,
        clientId: pickerProject.clientId,
      });
    },
    [pickerProject, onSelect],
  );

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (pickerProject) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setTabIndex((i) => Math.min(i + 1, PROJECT_TABS.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setTabIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleTabSelect(PROJECT_TABS[tabIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setPickerProject(null);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) handleSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [results, selectedIndex, pickerProject, tabIndex, handleSelect, handleTabSelect, onClose]);

  // Click outside to close
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  // Always render when parent shows us — parent controls visibility via showMention

  // Group results by type for display
  const grouped = (["project", "supplier", "rfp"] as EntityType[])
    .map((type) => ({
      type,
      items: results.filter((r) => r.type === type),
    }))
    .filter((g) => g.items.length > 0);

  // Flat index helper
  let flatIndex = 0;

  return (
    <div
      ref={containerRef}
      className="fixed z-[9999] w-72 max-h-[300px] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {pickerProject ? (
        <div className="p-1">
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Select page:
          </div>
          {PROJECT_TABS.map((tab, i) => (
            <button
              key={tab.hash}
              className={`flex w-full items-center rounded-md px-3 py-1.5 text-sm ${
                i === tabIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onMouseEnter={() => setTabIndex(i)}
              onClick={() => handleTabSelect(tab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="p-1">
          {grouped.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          )}
          {grouped.map((group) => {
            const Icon = TYPE_ICON[group.type];
            return (
              <div key={group.type}>
                <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {TYPE_LABEL[group.type]}
                </div>
                {group.items.map((item) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={item.id}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                        idx === selectedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => handleSelect(item)}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
