# Project ↔ RFP Interaction Design

**Date:** April 1, 2026
**Status:** Approved — ready for implementation

---

## Core Principle

Projects are the top entity. Everything flows downstream from them. Standalone pages (Suppliers, RFPs, Clients) serve as data entry registries that projects pull from.

## RFP Ownership

- RFPs are owned by projects via `projectId` field
- `clientId` is derived from the project (kept for backward compat on old RFPs)
- One RFP can cover multiple packages via `packageIds[]`
- One package has one RFP (no re-bid tracking)

## Supplier Award Flow

1. RFP goes through bid evaluation → winning proposal selected
2. User manually assigns awarded supplier per-package in Project → Overview → package edit
3. Supplier assignment is per-package, not per-RFP (one RFP with 10 packages could award 10 different suppliers)

## Financial Flow

1. RFP proposals have a `price` (total bid price)
2. On award, the total RFP award value is displayed on project financials
3. User manually allocates per-package award amounts
4. Per-package values remain editable/override-able at all times

## % Complete / RAG Enhancement

- Packages with a linked RFP that has been awarded contribute more to % complete
- Packages with no linked RFP are flagged differently in RAG status
- Details TBD as we build — incremental expansion

## Standalone RFPs Page

- Shows ALL RFPs (both project-linked and orphan)
- Add "Project" column showing which project each RFP belongs to
- Unlinked RFPs show "—" in the Project column

## Creating RFPs

- From `/dashboard/rfps/new`: optional project/package selection (existing)
- From Project → RFPs tab → "Create RFP": pre-fills client + project, package selection optional

## UI Cross-References

- Package → shows linked RFP title (clickable link to RFP detail)
- RFP → shows which project + packages it covers
- Project RFPs tab → table of all linked RFPs
