use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        std::fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("procureflow.db");
        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        // Run migrations
        Self::migrate(&conn)?;

        Ok(Self { conn: Mutex::new(conn) })
    }

    fn migrate(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                industry TEXT,
                contact_name TEXT,
                contact_email TEXT,
                contact_phone TEXT,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                client_id TEXT REFERENCES clients(id),
                client_name TEXT,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'active',
                milestone_order TEXT,
                milestone_labels TEXT,
                milestone_icons TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS suppliers (
                id TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                contact_name TEXT,
                contact_email TEXT,
                contact_phone TEXT,
                website TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                country TEXT,
                zip TEXT,
                categories TEXT,
                certifications TEXT,
                notes TEXT,
                coverage TEXT,
                prequalification TEXT,
                rating INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS rfps (
                id TEXT PRIMARY KEY,
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
                supplier_access_codes TEXT,
                questions TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS packages (
                id TEXT PRIMARY KEY,
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
                milestone_durations TEXT,
                milestones TEXT,
                percent_complete REAL DEFAULT 0,
                rag_status TEXT DEFAULT 'on-track',
                payment_milestones TEXT,
                comment TEXT,
                associated_rfp_id TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS change_orders (
                id TEXT PRIMARY KEY,
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
                comments TEXT,
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

            CREATE TABLE IF NOT EXISTS risks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                risk_number TEXT,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'open',
                risk_owner TEXT,
                impact INTEGER DEFAULT 1,
                likelihood INTEGER DEFAULT 1,
                estimated_financial_value REAL,
                estimated_time_impact TEXT,
                action_description TEXT,
                action_status TEXT DEFAULT 'pending',
                target_completion_date TEXT,
                last_updated TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS todos (
                id TEXT PRIMARY KEY,
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

            CREATE TABLE IF NOT EXISTS deliveries (
                id TEXT PRIMARY KEY,
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

            CREATE TABLE IF NOT EXISTS contracts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                package_id TEXT,
                package_name TEXT,
                supplier_name TEXT,
                terms TEXT,
                notes TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY,
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

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
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

            CREATE TABLE IF NOT EXISTS proposals (
                id TEXT PRIMARY KEY,
                rfp_id TEXT REFERENCES rfps(id),
                project_id TEXT,
                client_id TEXT,
                supplier_id TEXT,
                supplier_name TEXT,
                status TEXT DEFAULT 'submitted',
                revision INTEGER DEFAULT 0,
                price REAL DEFAULT 0,
                attachments TEXT,
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

            CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                project_id TEXT,
                description TEXT,
                client_id TEXT,
                client_name TEXT,
                status TEXT DEFAULT 'draft',
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS schedule_packages (
                id TEXT PRIMARY KEY,
                schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                content TEXT,
                category TEXT,
                type TEXT DEFAULT 'rfp',
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                category TEXT,
                target_collection TEXT,
                target_doc_id TEXT,
                client_id TEXT,
                details TEXT,
                user_name TEXT,
                user_email TEXT,
                timestamp TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT,
                role TEXT DEFAULT 'admin',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS coverage (
                id TEXT PRIMARY KEY,
                supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
                country_code TEXT,
                country_name TEXT,
                state_code TEXT,
                state_name TEXT,
                coverage_status TEXT DEFAULT 'No coverage',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS prequalifications (
                id TEXT PRIMARY KEY,
                supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS rfp_questions (
                id TEXT PRIMARY KEY,
                rfp_id TEXT NOT NULL REFERENCES rfps(id) ON DELETE CASCADE,
                supplier_id TEXT,
                supplier_name TEXT,
                question TEXT NOT NULL,
                question_attachments TEXT,
                answer TEXT,
                answer_attachments TEXT,
                is_public INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                answered_at TEXT
            );

            CREATE TABLE IF NOT EXISTS activity_comments (
                id TEXT PRIMARY KEY,
                schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
                package_id TEXT,
                activity_key TEXT,
                author_name TEXT,
                author_id TEXT,
                text TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS invites (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                role TEXT DEFAULT 'editor',
                client_ids TEXT,
                status TEXT DEFAULT 'pending',
                invited_by TEXT,
                accepted_at TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_packages_project ON packages(project_id);
            CREATE INDEX IF NOT EXISTS idx_rfps_project ON rfps(project_id);
            CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
            CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
            CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
            CREATE INDEX IF NOT EXISTS idx_deliveries_project ON deliveries(project_id);
            CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
            CREATE INDEX IF NOT EXISTS idx_questions_project ON questions(project_id);
            CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_type, entity_id);
            CREATE INDEX IF NOT EXISTS idx_proposals_rfp ON proposals(rfp_id);
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
            CREATE INDEX IF NOT EXISTS idx_schedule_packages ON schedule_packages(schedule_id);
            CREATE INDEX IF NOT EXISTS idx_coverage_supplier ON coverage(supplier_id);
            CREATE INDEX IF NOT EXISTS idx_prequalifications_supplier ON prequalifications(supplier_id);
            CREATE INDEX IF NOT EXISTS idx_rfp_questions_rfp ON rfp_questions(rfp_id);
            CREATE INDEX IF NOT EXISTS idx_activity_comments_schedule ON activity_comments(schedule_id);
            CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
        ")?;

        // Migrations for existing databases
        // Add updated_at to users table if missing (v0.1.0 → v0.1.1)
        let has_updated_at: bool = conn.prepare("SELECT updated_at FROM users LIMIT 1").is_ok();
        if !has_updated_at {
            conn.execute_batch("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))")?;
        }

        // Ensure a default local user exists
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM users", [], |row| row.get(0)
        )?;
        if count == 0 {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO users (id, email, display_name, role) VALUES (?1, ?2, ?3, ?4)",
                params![id, "local@procureflow.desktop", "Local User", "admin"],
            )?;
        }

        Ok(())
    }
}
