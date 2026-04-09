# ProcureFlow — Feature Backlog

**Source:** procurement Tracker Template (.xlsm) analyzed March 31, 2026
**Branch:** `dev/contributor-experimental`
**Status:** Planning — no implementation started

---

## Priority Legend
- **P1** — Core functionality, required for initial procurement suite release
- **P2** — Important, needed for full project lifecycle coverage
- **P3** — Valuable, can be deferred without blocking core workflows
- **Low** — Nice to have, build when capacity allows

---

## Feature A — Enhanced procurement Schedule Tracker (P1)

**What it does:** Extends the existing Schedule system with auto-generated baseline schedules, lead-time calculations, and % completion metrics. Currently our schedule tracks packages × milestones with Planned/Forecast/Actual dates. This adds the backward-pass scheduling engine that the Excel tracker uses.

**procurement context:** procurement procurement managers need to know "given a Required on Job date and manufacturer lead time, when does each milestone need to happen?" The system calculates this automatically, then tracks variance as dates slip.

**Implementation scope:**
- Add `leadTimeWeeks` and `rojDate` (Required on Job) fields to each SchedulePackage
- Build backward-pass calculation: from ROJ date, subtract lead times for Production → Shop Drawing → Submittal → PO Issue → etc. to generate planned dates
- Add "Auto-Generate Schedule" button that runs the calculation and fills planned dates
- Add `percentComplete` computed field based on milestone completion (milestones with actual dates / total milestones up to Production Start)
- Add RAG (Red/Amber/Green) status per package based on: on track, at risk (forecast > planned by X days), late (actual missed), done
- Integrate % complete and RAG into the procurement Summary view on the dashboard

**Depends on:** Existing Schedule system (built)

---

## Feature B — Financial Tracking (P1)

**What it does:** Adds budget, award value, change orders, savings tracking, and payment milestone management per package per project.

**procurement context:** The procurement team needs to track budget vs. actual spend, capture savings from BAFO negotiations, manage change orders with an approval workflow, and schedule payments tied to equipment milestones (deposit → FAT → shipment → delivery → retention).

**Sub-features:**

### B1 — Package-Level Budgets & Cost Tracking
- Add `budget`, `awardValue`, `changeOrderTotal`, `deltaTobudget` fields to SchedulePackage
- Cost summary view: budget vs award, change order impact, total exposure
- Visibility: anyone assigned to the project (same client scoping as RFPs)

### B2 — Change Order Management
- New `changeOrders` collection in Firestore with: CO ID, date, initiator, project, package, supplier, change type, title, description, value, status (draft → submitted → approved → rejected), approval date, notes
- Approval workflow: submit → admin/editor reviews → approve/reject with comment
- Full audit trail (logAudit on every status change)
- Comments thread per change order

### B3 — Savings Tracker
- Per-package: initial bid price, BAFO price, price reduction
- Auto-calculate total savings per project
- Feed into dashboard KPIs

### B4 — Payment Milestones & Schedule
- Customizable payment stages per project (not fixed — varies by client/package)
- Default stages: Order Deposit, Design Approval, Production Start, 90 days before ship, FAT, Shipment, Delivery, Installation Complete, Startup, Retention Release
- Each stage has a percentage of contract value and a target date
- Track actual payment dates vs planned

**Depends on:** Schedule system, client scoping

---

## Feature C — Delivery & Logistics Tracking (P2)

**What it does:** Detailed delivery tracking per package with multiple date types (ROJ, target, contracted, vendor planned), quantities, incoterms, and departure/arrival points. Equipment list adds physical specs.

**procurement context:** After PO is issued, the focus shifts to "is the equipment going to arrive on time and in the right quantities?" This tracks the logistics chain from factory to job site.

**Sub-features:**

### C1 — Delivery Schedule
- Per-package delivery rows with: ROJ date/qty, target date/qty, contracted date/qty, vendor planned date/qty
- Last updated timestamp, comments, departure/arrival points, incoterms
- Support multiple delivery batches per package (e.g., 3 of 5 chillers in shipment 1)

### C2 — Equipment List / Specs
- Per-package: total quantity, manufacturer, manufacturer address, estimated dimensions/weight, spec numbers/links, PO number/link, contract link
- Manual entry with option to pull from supplier records
- Import capability with human verification

### C3 — Cx Completion & Post-Delivery Support
- Track commissioning status per package after delivery
- Integrate with or extend the existing schedule milestones (Installation Complete → Startup)

**Depends on:** Schedule system, Supplier registry

---

## Feature D — Contract Management (P2)

**What it does:** Per-package contract checklist and detailed contract terms tracking. Covers 17 standard contract areas from signing through warranty.

**procurement context:** Each equipment package has its own contract with specific terms. The consultancy needs to track which terms have been negotiated, what the details are, and what's still outstanding.

**Sub-features:**

### D1 — Contract Checklist
- Per-package grid: 17 contract term categories (Signed, Spare Parts, L&D Terms, Taxes, FWT Included, Freight Terms, Payment Terms, Delivery Dates, Cancellation Terms, CDEs, Warranty, CX Support, Startup Support, SAT, Training Services, Training Docs, Open Items/Risks)
- Each term has: status (complete/incomplete/NA), detailed text notes, last updated
- Visual summary: how many terms complete per package

### D2 — Contract Details Storage
- Rich text per term per package (not just yes/no)
- Document upload decision deferred — metadata-only for now

**Depends on:** Schedule system (packages), Supplier registry

---

## Feature E — Risk Register (P2)

**What it does:** Project-level risk tracking with impact × likelihood scoring, financial estimates, and action tracking.

**procurement context:** Procurement risks (supplier insolvency, lead time extension, price escalation, quality issues) need to be identified, scored, and tracked. This is human-entered and human-evaluated — no AI.

**Implementation scope:**
- New `risks` collection: risk ID, project, status (open/mitigated/closed), title, description, risk owner, impact (1-5), likelihood (1-5), auto-calculated score and rating (Low/Medium/High/Critical)
- Estimated financial value, weighted financial value, estimated time impact
- Action controls/description, targeted completion date, action status, last updated
- Alerts when risk rating changes (toast notification to assigned users)
- Client-scoped (clientId required)
- Full audit logging on all changes

**Depends on:** Client scoping

---

## Feature F — Internal Q&A / RFI Log (P2)

**What it does:** Expands the existing portal Q&A into a broader communication tracking system that covers internal procurement team questions, supplier clarifications, and RFIs (Requests for Information) throughout the project lifecycle.

**procurement context:** During procurement, questions flow in all directions — procurement team to supplier, supplier to procurement team, procurement team to client, GC to procurement team. Post-RFP, RFIs become the primary communication vehicle. These need to be tracked, assigned, and resolved with timestamps.

**Implementation scope:**
- Extend existing `rfp_questions` collection or create new `project_questions` collection
- Fields: index, status (open/closed), date opened, date closed, asker, owner, answered by, equipment/package, vendor, question, response, notes
- Support both RFP-phase Q&A and post-award RFI tracking
- Internal (staff-only) vs external (supplier-visible) flag
- Search, filter by status/equipment/vendor
- Client-scoped

**Depends on:** Existing Q&A system, client scoping

---

## Feature G — Project To-Do List (P3)

**What it does:** Simple task management per project with package/vendor association.

**procurement context:** Procurement teams track dozens of small tasks (follow up on submittal, confirm delivery address, chase PO signature). This is a lightweight tool that doesn't need to integrate deeply with other systems.

**Implementation scope:**
- New `project_todos` collection: task #, package, vendor, description, assigned to, status (open/in-progress/done), comments, projected closure date, actual closure date, archive flag
- Per-project view with filter by status, package, assignee
- Not integrated with schedule milestones (standalone)
- Client-scoped

**Depends on:** Client scoping

---

## Feature H — Factory Witness Testing (FWT) (Low)

**What it does:** Schedule and manage factory witness tests per package.

**procurement context:** Before equipment ships, the procurement team may send representatives to the manufacturer's facility to witness testing. This tracks scheduling, attendees, test scripts, and outcomes.

**Implementation scope:**
- Per-package: status, start/end dates, FWT date(s), address, script status, attendee groups (up to 5), notes
- FWT Contact List: name, email, phone, entity, mapped to packages
- Simple CRUD — no complex workflow

**Depends on:** Schedule system (packages), Supplier registry

---

## Feature I — Executive Dashboard & Reporting (P1)

**What it does:** Built-in data visualization and reporting — a PowerBI-style dashboard within ProcureFlow itself. Eliminates the need for external BI tools.

**procurement context:** Leadership needs at-a-glance visibility: how many packages are on track, total exposure vs budget, upcoming critical milestones, risk summary, savings achieved. Currently this requires exporting to PowerBI.

**Implementation scope:**
- Extend existing dashboard page with procurement-specific widgets
- KPI cards: total budget, total awarded, total savings, % packages on track, overdue count
- Charts: buyout progress (% bought out over time), budget vs actual by package, milestone completion by discipline, RAG distribution
- Filterable by client, project, discipline, date range
- Built with Recharts (already in the stack)
- No external BI tool dependency
- Details to be refined as underlying data features are built

**Depends on:** Features A (schedule enhancements), B (financial tracking)

---

## Feature J — Cross-Project Activities Summary (P2)

**What it does:** A unified view aggregating upcoming, overdue, and all milestone activities across every project. Replaces the old standalone `/dashboard/schedules/summary` page with a project-aware version.

**procurement context:** Procurement managers oversee multiple projects simultaneously. They need a single view showing "what's due this week across all my projects" without opening each project individually.

**Implementation scope:**
- New page at `/dashboard/activities` (or replace the existing `/dashboard/schedules/summary`)
- Query all `projects/{id}/packages` subcollections for the user's accessible clients
- Flatten packages × milestones into activities (same pattern as the old summary page)
- Tabs: Upcoming (30 days), Overdue, All Activities
- Filter by project, package, milestone, client
- Inline date editing with write-back to project packages
- Comments integration (from `activityComments` collection)
- Add to sidebar under Planning

**Depends on:** Feature A (project packages with milestones)

---

## Implementation Order (Recommended)

| Phase | Features | Rationale |
|---|---|---|
| **Phase 1** | A (Enhanced Schedule) + B1 (Budgets) | Foundation — everything else builds on these |
| **Phase 2** | B2 (Change Orders) + B3 (Savings) + B4 (Payments) | Complete financial picture |
| **Phase 3** | E (Risk Register) + F (Q&A/RFI expansion) + G (To-Do) | Operational tools |
| **Phase 4** | C (Delivery/Logistics) + D (Contract Management) | Post-award lifecycle |
| **Phase 5** | I (Executive Dashboard) | Requires data from Phases 1-4 |
| **Phase 6** | H (FWT) | Low priority, standalone |

---

## Coding Standards Reminder

All new features must follow the coding standards in `CLAUDE.md`:
- 500-line hard cap per file
- No `as any` — proper types from day one
- Firestore rules written before code
- `clientId` on every new collection
- Audit logging on every write
- Zod validation on all forms and API routes
- Pre-commit: `typecheck` + `lint` + `build` must pass
