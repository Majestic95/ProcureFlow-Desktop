# ProcureFlow — Tauri + SQLite Desktop Architecture

**Branch:** `platform/tauri-sqlite`
**Status:** Planning — pre-coding deep dive complete
**Goal:** Single-user desktop application with local SQLite database. Same GUI/UX as web version. No cloud dependency, no third-party data access. Built-in update system.

---

## End State

One installer (`ProcureFlow-setup.exe`) that installs a desktop app which:
- Looks, acts, and feels identical to the current web application
- Stores all data in a local SQLite database file
- Stores all uploaded files in a local filesystem directory
- Requires no internet connection for core functionality
- Requires no Firebase, Google Cloud, or any external service
- Includes a one-click "Check for Updates" button on the home screen
- Is fully owned and distributable by the employer
- Produces a ~10-15MB executable (vs ~150MB for Electron)

---

## Architecture

```
ProcureFlow.exe (Tauri v2 binary, ~10-15MB)
├── Frontend: React + Vite (same components, same styling)
│   ├── Tailwind CSS 3 (unchanged)
│   ├── shadcn/ui components (unchanged)
│   ├── Recharts, react-simple-maps (unchanged)
│   ├── react-hook-form + Zod (unchanged)
│   └── All existing hooks, utilities, types (unchanged)
├── Routing: React Router v6 (replaces Next.js App Router)
├── Backend: Tauri Rust core
│   ├── tauri-plugin-sql (SQLite via sqlx)
│   ├── tauri-plugin-fs (local file access)
│   ├── tauri-plugin-dialog (file picker dialogs)
│   ├── tauri-plugin-updater (one-click updates)
│   └── tauri-plugin-notification (optional)
├── Database: procureflow.db (single SQLite file)
└── File storage: Local filesystem (AppData/ProcureFlow/storage/)
```

---

## GUI/UX Guarantee

The frontend renders in **Microsoft Edge WebView2** (Chromium-based), which is the same rendering engine as Chrome and Edge. This means:

- **Every React component** renders identically — no visual differences
- **Every Tailwind CSS class** produces the same output
- **Every shadcn/ui primitive** (buttons, dialogs, selects, accordions) works unchanged
- **Dark mode** works identically (CSS variables, localStorage persistence)
- **Recharts** charts render identically (SVG in Chromium)
- **All animations** (Tailwind animate, Radix transitions) work unchanged
- **Custom scrollbar styling** works (WebView2 supports ::-webkit-scrollbar)
- **All npm packages** that run client-side work unchanged (xlsx, date-fns, docx, jspdf, etc.)
- **DevTools** available via Ctrl+Shift+I for debugging (same as Chrome)

**What the user sees:** The exact same application, in a native window frame, with native window controls (minimize/maximize/close). No browser address bar, no tabs — just ProcureFlow.

---

## What Changes vs. What Stays

### Stays the Same (zero changes)
- All React components (~100+ files in src/components/)
- All TypeScript types and interfaces (src/types/)
- All business logic (schedule engine, financial calculations, RAG status)
- All UI libraries (Tailwind, shadcn/ui, Recharts, TanStack Table)
- All form validation (react-hook-form + Zod)
- Excel import/export (xlsx library — pure JS, no server needed)
- PDF generation (jspdf, html2pdf.js)
- Document generation (docx, docxtemplater)
- Markdown rendering (react-markdown)
- Gantt chart, dashboard charts, risk heat map
- Notes system UI (threading, pins, mentions)
- Global pin bar
- Dark mode toggle
- Changelog popup

### Changes Required

| What | From | To |
|---|---|---|
| Bundler | Next.js | Vite |
| Routing | Next.js App Router (file-based) | React Router v6 (explicit routes) |
| `next/link` | 25 files | React Router `<Link>` |
| `next/navigation` | 20 files | React Router hooks |
| `next/image` | 3 files | Standard `<img>` tags |
| `"use client"` directives | ~40 files | Remove (not needed in Vite) |
| Database | Firestore SDK | tauri-plugin-sql (SQLite) |
| Auth | Firebase Auth | Local PIN/password (or none) |
| File storage | Firebase Storage | tauri-plugin-fs (local filesystem) |
| API routes (3) | Next.js API routes | Tauri commands or client-side |
| Middleware | Next.js middleware | Remove (not needed in desktop app) |
| Real-time listeners | Firestore onSnapshot | Not needed (single user) |
| Security rules | Firestore rules | Not needed (single user, local data) |
| Hosting | Firebase App Hosting | Desktop installer (NSIS) |
| AI integration | @genkit-ai/next (server) | Direct Google AI API calls (optional) |

---

## Update System

### How Updates Work

Tauri's built-in `tauri-plugin-updater` provides a complete auto-update system:

1. **Developer builds a new version** and publishes the installer + signature file
2. **The app checks for updates** on launch or when user clicks "Check for Updates"
3. **If a new version exists**, a dialog shows "Update available. Download now?"
4. **User clicks Update** → app downloads, installs, and restarts automatically

### Update Infrastructure

```
Update server (can be any of these):
├── GitHub Releases (free, easiest)
├── Static file server on company network
├── S3 bucket or any HTTP file host
└── update.json (version manifest)
```

**update.json format:**
```json
{
  "version": "1.2.0",
  "notes": "Bug fixes and new features",
  "pub_date": "2026-04-15T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://releases.example.com/ProcureFlow-1.2.0-setup.nsis.zip",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQgc2lnbmF..."
    }
  }
}
```

### Update Security

Each update is signed with an Ed25519 keypair:
- **Private key** stays with the developer (never distributed)
- **Public key** is embedded in the app at build time
- The app verifies the signature before installing — prevents tampered updates
- No code signing certificate needed for this (separate from Windows code signing)

### Update UI

A button on the ProcureFlow home screen:
```
[🔄 Check for Updates]  Current version: 1.1.0
```
Clicking it checks the update endpoint. If an update exists:
```
┌─────────────────────────────────────┐
│  Update Available                    │
│                                      │
│  Version 1.2.0 is ready to install.  │
│  Release notes: Bug fixes, new...    │
│                                      │
│  [Update Now]    [Later]             │
└─────────────────────────────────────┘
```

---

## SQLite Schema

Relational schema mapping from Firestore NoSQL documents:

```sql
-- Core entities
CREATE TABLE clients (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  name TEXT NOT NULL,
  industry TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  client_id TEXT REFERENCES clients(id),
  client_name TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','on-hold','completed','archived')),
  milestone_order TEXT, -- JSON array
  milestone_labels TEXT, -- JSON object
  milestone_icons TEXT, -- JSON object
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  company_name TEXT NOT NULL,
  contacts TEXT, -- JSON array
  categories TEXT, -- JSON array
  rating INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE rfps (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT REFERENCES projects(id),
  client_id TEXT REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  flow_type TEXT DEFAULT 'simple',
  budget REAL,
  country_code TEXT,
  state_code TEXT,
  city_name TEXT,
  open_date TEXT,
  close_date TEXT,
  is_confidential INTEGER DEFAULT 0,
  supplier_access_codes TEXT, -- JSON object
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Project subcollections → tables with project_id FK
CREATE TABLE packages (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  discipline TEXT,
  item_number INTEGER,
  quantity INTEGER,
  budget REAL,
  award_value REAL,
  change_order_total REAL DEFAULT 0,
  initial_bid_price REAL,
  bafo_price REAL,
  awarded_supplier_id TEXT,
  awarded_supplier_name TEXT,
  roj_date TEXT,
  lead_time_weeks INTEGER,
  milestone_durations TEXT, -- JSON object
  milestones TEXT NOT NULL, -- JSON object (MilestoneData per key)
  percent_complete REAL DEFAULT 0,
  rag_status TEXT DEFAULT 'on-track',
  payment_milestones TEXT, -- JSON array
  comment TEXT,
  associated_rfp_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE change_orders (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  co_number TEXT,
  package_id TEXT,
  package_name TEXT,
  supplier_name TEXT,
  change_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  value REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  comments TEXT, -- JSON array
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  rejected_by TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE risks (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  risk_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  risk_owner TEXT,
  impact INTEGER DEFAULT 1,
  likelihood INTEGER DEFAULT 1,
  score INTEGER GENERATED ALWAYS AS (impact * likelihood) STORED,
  estimated_financial_value REAL,
  estimated_time_impact TEXT,
  action_description TEXT,
  action_status TEXT DEFAULT 'pending',
  target_completion_date TEXT,
  last_updated TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE todos (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_number INTEGER,
  package_name TEXT,
  vendor_name TEXT,
  description TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT DEFAULT 'open',
  comments TEXT,
  projected_closure TEXT,
  actual_closure TEXT,
  archived INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id TEXT,
  package_name TEXT,
  supplier_name TEXT,
  batch_number INTEGER,
  description TEXT,
  quantity INTEGER,
  incoterms TEXT,
  departure_point TEXT,
  arrival_point TEXT,
  roj_date TEXT,
  target_date TEXT,
  contracted_date TEXT,
  vendor_planned_date TEXT,
  actual_date TEXT,
  status TEXT DEFAULT 'pending',
  comments TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id TEXT,
  package_name TEXT,
  supplier_name TEXT,
  terms TEXT NOT NULL, -- JSON array of ContractTerm objects
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idx INTEGER,
  status TEXT DEFAULT 'open',
  date_opened TEXT DEFAULT (datetime('now')),
  date_closed TEXT,
  asker TEXT,
  owner TEXT,
  answered_by TEXT,
  package_name TEXT,
  vendor_name TEXT,
  question TEXT NOT NULL,
  response TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  tab TEXT,
  tab_label TEXT,
  author_name TEXT,
  text TEXT NOT NULL,
  pinned INTEGER DEFAULT 0,
  parent_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  rfp_id TEXT REFERENCES rfps(id),
  project_id TEXT,
  client_id TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  status TEXT DEFAULT 'submitted',
  revision INTEGER DEFAULT 0,
  price REAL DEFAULT 0,
  attachments TEXT, -- JSON array
  technical_score REAL DEFAULT 0,
  commercial_score REAL DEFAULT 0,
  ehs_score REAL DEFAULT 0,
  schedule_score REAL DEFAULT 0,
  quality_score REAL DEFAULT 0,
  risk_score REAL DEFAULT 0,
  final_score REAL DEFAULT 0,
  evaluator_comments TEXT,
  ai_summary TEXT,
  submitted_at TEXT DEFAULT (datetime('now'))
);

-- Audit trail
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(10))),
  action TEXT NOT NULL,
  category TEXT,
  target_collection TEXT,
  target_doc_id TEXT,
  client_id TEXT,
  details TEXT, -- JSON object
  user_name TEXT,
  user_email TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Local user (single-user, simplified)
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes for common queries
CREATE INDEX idx_packages_project ON packages(project_id);
CREATE INDEX idx_rfps_project ON rfps(project_id);
CREATE INDEX idx_change_orders_project ON change_orders(project_id);
CREATE INDEX idx_risks_project ON risks(project_id);
CREATE INDEX idx_todos_project ON todos(project_id);
CREATE INDEX idx_deliveries_project ON deliveries(project_id);
CREATE INDEX idx_contracts_project ON contracts(project_id);
CREATE INDEX idx_questions_project ON questions(project_id);
CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id);
CREATE INDEX idx_proposals_rfp ON proposals(rfp_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
```

---

## Single-User Simplifications

Since this is a single-user application:

| Web Feature | Desktop Equivalent |
|---|---|
| Firebase Auth (SSO, roles) | Optional local PIN lock |
| Role-based access (Viewer/Editor/Admin) | Not needed — user has full access |
| Client isolation rules | Not needed — user sees all their data |
| Firestore security rules | Not needed — local database |
| onSnapshot real-time listeners | Not needed — single user, no concurrent edits |
| Invite system | Not needed |
| Portal (supplier access) | Not included (web-only feature) |
| Rate limiting | Not needed |

---

## Migration Phases

### Phase 1: Tauri + Vite Shell (~3 hours)
- Initialize Tauri v2 project
- Set up Vite + React + TypeScript
- Configure Tailwind CSS + shadcn/ui for Vite
- Verify all UI components render in Tauri webview
- Set up path aliases (`@/` mapping)

### Phase 2: Routing (~4-6 hours)
- Install React Router v6
- Convert 30 Next.js pages to explicit route definitions
- Replace `next/link` → React Router `<Link>` (25 files)
- Replace `next/navigation` → React Router hooks (20 files)
- Replace `next/image` → `<img>` (3 files)
- Remove `"use client"` directives (not needed)
- Remove middleware (not needed in desktop)

### Phase 3: Data Layer (~12-20 hours, largest task)
- Set up tauri-plugin-sql with SQLite
- Create SQL schema (tables, indexes, foreign keys)
- Write database initialization migration
- Create TypeScript data access layer:
  - `db.projects.getAll()`, `db.projects.create()`, etc.
  - One function per Firestore operation, returns same data shapes
- Replace all Firebase SDK calls with data access layer calls
- Replace audit logging to write to SQLite audit_logs table

### Phase 4: File System (~2-4 hours)
- Set up tauri-plugin-fs
- Replace Firebase Storage uploads with local file writes
- Replace Firebase Storage downloads with local file reads
- Set up file picker dialogs for import/export

### Phase 5: Update System (~2-3 hours)
- Configure tauri-plugin-updater
- Generate signing keypair
- Set up update endpoint (GitHub Releases or company server)
- Add "Check for Updates" button to home screen
- Document the update publishing process

### Phase 6: Build & Test (~4-8 hours)
- Build Windows installer (NSIS)
- Test all features end-to-end
- Verify data persistence (create data, close app, reopen)
- Verify Excel import/export
- Verify PDF generation
- Test update flow

**Total estimated: 30-45 hours**

---

## Build & Distribution

### Building
```bash
npm run tauri build
```
Produces:
- `src-tauri/target/release/ProcureFlow.exe` (standalone binary)
- `src-tauri/target/release/bundle/nsis/ProcureFlow-setup.exe` (installer)

### Installer
NSIS installer with:
- Install/uninstall wizard
- Desktop shortcut option
- Start menu entry
- ~10-15MB download

### Code Signing
- **Without signing:** Windows SmartScreen shows warning on first install. User clicks "More info" → "Run anyway." Works fine for internal distribution.
- **With signing ($200-500/year):** No warning. Professional appearance.
- **IT can whitelist** the app via Group Policy for work computers.

---

## File Structure on User's Computer

```
C:\Program Files\ProcureFlow\
├── ProcureFlow.exe              ← The application

C:\Users\{user}\AppData\Local\ProcureFlow\
├── procureflow.db               ← All data (one file)
├── storage\                     ← Uploaded files
│   ├── rfps\{rfpId}\           ← RFP documents
│   ├── suppliers\{id}\         ← Supplier documents
│   └── templates\              ← Document templates
├── backups\                     ← Periodic automatic backups
│   └── procureflow-2026-04-02.db
└── logs\                        ← Application logs
```

---

## Prerequisites for Development

- **Rust** (MSVC toolchain for Windows)
- **Microsoft Visual Studio C++ Build Tools**
- **Node.js** (already installed)
- **WebView2 Runtime** (pre-installed on Windows 10 1803+)

---

*Architecture finalized April 2, 2026. Ready for Phase 1 implementation.*
