# ProcureFlow — Project Data Model

**Status:** Implemented (Phase 1 complete, Phase 2+ pending)
**Last updated:** April 1, 2026

---

## Entity Hierarchy

```
Client (registry — data entry only)
  ↓ assigned to
Project (TOP ENTITY — everything flows downstream)
  ├─ Equipment Packages (subcollection, defined at project level)
  │    ├─ Schedule milestones (Planned/Forecast/Actual per milestone)
  │    ├─ Financial data (budget, award value, change order total)
  │    ├─ Computed fields (% complete, RAG status)
  │    ├─ Supplier assignment (manual, per-package)
  │    └─ RFP link (associatedRfpId)
  ├─ RFPs (owned by project via projectId, each covers subset of packages)
  │    ├─ Proposals (bids per RFP, with pricing)
  │    └─ Q&A / Supplier Portal
  ├─ Financial Tracking (budget, awards, COs, payments per package)
  ├─ Delivery Tracking (logistics per package)
  ├─ Contract Management (terms per package)
  ├─ Risk Register (project-level)
  ├─ Q&A / RFI Log (project-level, separate from RFP portal Q&A)
  ├─ To-Do List (project tasks)
  └─ FWT (per package, low priority)

Standalone pages (Suppliers, RFPs, Clients):
  → Data entry registries that projects pull from
  → RFPs page shows ALL RFPs with "Project" column
  → Suppliers page is global (not project-scoped)
```

---

## Firestore Collections

### `projects` — top-level entity

```typescript
interface Project {
  id: string;
  clientId: string;
  clientName: string;              // cached for display
  name: string;                    // e.g., "Data Center Phase 2 - Indianapolis"
  description?: string;
  status: 'active' | 'on-hold' | 'completed' | 'archived';
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `projects/{projectId}/packages` — subcollection

Equipment packages defined at the project level. Each package has its own schedule milestones, financial data, and computed metrics.

```typescript
interface EquipmentPackage {
  id: string;
  name: string;                    // e.g., "Air-Cooled Chillers"
  discipline: string;              // Mechanical, Electrical, Civil, Others, or custom
  itemNumber: number;              // display order

  // Financial
  budget?: number;
  awardValue?: number;
  changeOrderTotal?: number;

  // Supplier assignment (manual, per-package)
  awardedSupplierId?: string;
  awardedSupplierName?: string;

  // Schedule inputs
  rojDate?: string;                // Required on Job date (ISO or 'TBD')
  leadTimeWeeks?: number;          // Manufacturing lead time in weeks
  milestoneDurations?: Record<string, number>;  // business days per milestone

  // Schedule data
  milestones: Record<string, MilestoneData>;

  // Computed (recalculated on save via recomputePackageMetrics)
  percentComplete?: number;        // 0-100
  ragStatus?: 'on-track' | 'at-risk' | 'late' | 'done';

  // Links
  rfpIds?: string[];               // which RFPs include this package
  associatedRfpId?: string;        // primary RFP

  // Metadata
  comment?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `rfps` — existing, now owned by projects

```typescript
interface RFP {
  // ... all existing fields ...
  projectId?: string;              // links to project (optional for backward compat)
  packageIds?: string[];           // which packages this RFP covers
}
```

### Existing collections — backward compatible

| Collection | Change | Status |
|---|---|---|
| `rfps` | Added optional `projectId`, `packageIds` | Implemented |
| `proposals` | Has optional `projectId`, `clientId` | Implemented |
| `rfp_questions` | Has optional `projectId`, `clientId` | Implemented |
| `schedules` | Deprecated — schedule lives in project packages | Route preserved, hidden from nav |

### Subcollections under `projects/{projectId}/`

| Subcollection | Purpose | Status |
|---|---|---|
| `packages` | Equipment packages with schedule + financials | **Implemented** |
| `changeOrders` | Change order management | Rules ready, UI pending (Phase 2) |
| `risks` | Risk register entries | Rules ready, UI pending (Phase 3) |
| `todos` | Project task list | Rules ready, UI pending (Phase 3) |
| `deliveries` | Delivery tracking per package | Rules ready, UI pending (Phase 4) |
| `contracts` | Contract checklist + details per package | Rules ready, UI pending (Phase 4) |
| `fwt` | Factory witness test records | Rules ready, UI pending (Phase 6) |

---

## RFP ↔ Package Relationship

- Projects own RFPs via `projectId` field on the RFP document
- An RFP references one or more packages via `packageIds[]`
- Each package has one primary RFP (no re-bid tracking for now)
- Supplier award is **manual per-package**, not auto from RFP award
- Proposal pricing is displayed on project financials; user allocates per-package manually
- Per-package award values remain editable/override-able at all times

**Example:**
```
Project: "DC Phase 2 - Indianapolis"
  Packages: [Chillers, Generators, UPS, Transformers, ...]

  RFP 1: "Mechanical Equipment" → packageIds: [Chillers, UPS CRAH, Fanwalls]
  RFP 2: "Electrical Equipment" → packageIds: [Generators, Transformers, UPS, PDU, STS, ...]
```

---

## Cross-References (implemented)

| From | To | How |
|---|---|---|
| Package → RFP | `associatedRfpId` or `rfpIds[0]` on package | "View" link in package table |
| RFP → Project | `projectId` on RFP document | "Project" column in RFPs list page |
| Project → RFPs | Query `rfps` where `projectId == thisProject` | RFPs tab on project detail |
| Project → Packages | Subcollection `projects/{id}/packages` | Overview tab + Schedule tab |

---

## Schedule System (implemented)

The schedule is embedded in the project via the packages subcollection. Each package has milestones with Planned/Forecast/Actual dates.

### Key files

| File | Purpose | Lines |
|---|---|---|
| `src/lib/schedule-engine.ts` | Backward-pass calculation, % complete, RAG status | 235 |
| `src/lib/schedule-import-export.ts` | Excel import (header-matching, merge), export | 291 |
| `src/components/projects/schedule-tab.tsx` | Main orchestrator (toolbar, state, dialogs) | 750 |
| `src/components/projects/schedule-table.tsx` | Table view with date editing | 350 |
| `src/components/projects/schedule-gantt.tsx` | SVG Gantt chart with zoom/legend | 385 |

### Auto-generate schedule

Given a package's ROJ date and lead time:
1. Delivery = ROJ date
2. Production start = Delivery - (leadTimeWeeks × 5 business days)
3. Walk backward through milestones using configurable durations
4. Only fills dates that are currently 'TBD' (doesn't overwrite)

### % Complete

Counts milestones with actual dates out of 11 procurement milestones (Project Start through PO Issue). Post-PO milestones (submittal, shop drawing, production, delivery) are excluded.

### RAG Status

- **Done:** PO Issue has actual date
- **On Track:** No forecast exceeds planned
- **At Risk:** Any forecast exceeds planned by 1–14 days
- **Late:** Any forecast exceeds planned by >14 days, or milestone past due

---

## Financial System (implemented — Phase 1)

Financial data lives directly on the EquipmentPackage document:
- `budget` — allocated budget
- `awardValue` — contracted award amount
- `changeOrderTotal` — sum of approved COs (manual for now, auto when B2 built)

**Delta** is computed inline in the UI (not stored): `budget - (awardValue + changeOrderTotal)`

**Summary cards** on project Overview: Total Budget, Total Awarded, Delta to Budget, Bought Out %

---

## Dashboard Navigation (current)

```
Sidebar:
  GENERAL
    Dashboard (home)
    Coverage Map
  REGISTRIES
    Clients (admin only)
    Suppliers
    Templates (admin only)
  PLANNING
    Projects                 ← project list + detail with 9 tabs
  PROCESSES
    RFPs                     ← all RFPs with Project column
    Proposals
    Submit Proposal
  DEVELOPMENT (admin only)
    Dev Tools
    Audit Trail
```

**Hidden routes (still accessible via URL):**
- `/dashboard/schedules` — legacy standalone schedules
- `/dashboard/schedules/summary` — legacy activities summary
- `/dashboard/schedules/[id]` — legacy schedule detail

---

## Security Rules (implemented)

```
match /projects/{projectId} {
  allow read: if isInternal() && hasClientAccess(resource.data.clientId);
  allow create: if isAdmin() && valid clientId;
  allow update, delete: if isInternal() && canWriteForClient(resource.data.clientId);

  // All subcollections inherit parent's clientId check
  match /packages/{packageId} { ... }
  match /changeOrders/{coId} { ... }
  match /risks/{riskId} { ... }
  match /todos/{todoId} { ... }
  match /deliveries/{deliveryId} { ... }
  match /contracts/{contractId} { ... }
}
```

---

## Audit Logging (implemented)

All project-related Firestore writes are audit-logged:

| Action | Trigger |
|---|---|
| `project.created` | New project |
| `project.deleted` | Delete project |
| `project.status_changed` | Status dropdown change |
| `package.created` | Add package (Overview or Schedule) |
| `package.deleted` | Delete package |
| `package.financials_updated` | Edit budget/award/supplier |
| `schedule.milestone_updated` | Edit any date in schedule |
| `schedule.auto_generated` | Auto-generate from ROJ + lead time |
| `package.imported_update` | Excel import (existing package) |
| `package.imported_new` | Excel import (new package) |
| `rfp.linked_to_project` | Link existing RFP to project |

The `logAudit()` function strips `undefined` values before writing to Firestore.
