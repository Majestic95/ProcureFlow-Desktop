use crate::db::Database;
use serde_json::Value;
use tauri::State;

/// Generic: get all rows from a table, optionally filtered by a column
#[tauri::command]
pub fn db_get_all(
    db: State<Database>,
    table: String,
    filter_col: Option<String>,
    filter_val: Option<String>,
    order_by: Option<String>,
) -> Result<Vec<Value>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if !is_valid_table(&table) {
        return Err(format!("Invalid table: {}", table));
    }

    let mut sql = format!("SELECT * FROM {}", table);
    let mut param_values: Vec<String> = Vec::new();

    if let (Some(col), Some(val)) = (&filter_col, &filter_val) {
        if !is_valid_column(col) {
            return Err(format!("Invalid column: {}", col));
        }
        sql.push_str(&format!(" WHERE {} = ?1", col));
        param_values.push(val.clone());
    }

    if let Some(order) = &order_by {
        let parts: Vec<&str> = order.split_whitespace().collect();
        if !parts.is_empty() && is_valid_column(parts[0]) {
            let direction = match parts.get(1).map(|s| s.to_uppercase()).as_deref() {
                Some("DESC") => "DESC",
                _ => "ASC",
            };
            sql.push_str(&format!(" ORDER BY {} {}", parts[0], direction));
        }
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let rows = stmt.query_map(params.as_slice(), |row| {
        row_to_json(row, &column_names)
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

/// Generic: get a single row by id
#[tauri::command]
pub fn db_get_by_id(
    db: State<Database>,
    table: String,
    id: String,
) -> Result<Option<Value>, String> {
    let rows = db_get_all(db, table, Some("id".to_string()), Some(id), None)?;
    Ok(rows.into_iter().next())
}

/// Generic: insert a row, returns the new id
#[tauri::command]
pub fn db_insert(
    db: State<Database>,
    table: String,
    data: Value,
) -> Result<Value, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if !is_valid_table(&table) {
        return Err(format!("Invalid table: {}", table));
    }

    let obj = data.as_object().ok_or("data must be a JSON object")?;

    let id = match obj.get("id") {
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        _ => uuid::Uuid::new_v4().to_string(),
    };

    let mut columns = vec!["id".to_string()];
    let mut placeholders = vec!["?1".to_string()];
    let mut values: Vec<String> = vec![id.clone()];
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    // Track placeholder index separately to avoid gaps from skipped keys
    let mut param_idx: usize = 2;

    for (key, val) in obj.iter() {
        if key == "id" { continue; }
        if !is_valid_column(key) { continue; }

        let str_val = match val {
            Value::String(s) => s.clone(),
            Value::Null => continue,
            Value::Array(_) | Value::Object(_) => serde_json::to_string(val).unwrap_or_default(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => if *b { "1".to_string() } else { "0".to_string() },
        };

        columns.push(key.clone());
        placeholders.push(format!("?{}", param_idx));
        values.push(str_val);
        param_idx += 1;
    }

    if !columns.contains(&"created_at".to_string()) {
        columns.push("created_at".to_string());
        placeholders.push(format!("?{}", param_idx));
        values.push(now.clone());
        param_idx += 1;
    }
    if !columns.contains(&"updated_at".to_string()) && table != "audit_logs" && table != "app_config" {
        columns.push("updated_at".to_string());
        placeholders.push(format!("?{}", param_idx));
        values.push(now);
    }

    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        table,
        columns.join(", "),
        placeholders.join(", ")
    );

    let params: Vec<&dyn rusqlite::types::ToSql> = values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    conn.execute(&sql, params.as_slice()).map_err(|e| e.to_string())?;

    drop(conn);
    db_get_by_id(db, table, id)?
        .ok_or_else(|| "Insert succeeded but row not found".to_string())
}

/// Generic: update a row by id
#[tauri::command]
pub fn db_update(
    db: State<Database>,
    table: String,
    id: String,
    data: Value,
) -> Result<Value, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if !is_valid_table(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    if table == "audit_logs" {
        return Err("Audit logs are append-only and cannot be updated".to_string());
    }

    let obj = data.as_object().ok_or("data must be a JSON object")?;

    let mut set_clauses: Vec<String> = Vec::new();
    let mut values: Vec<String> = Vec::new();

    for (key, val) in obj.iter() {
        if key == "id" { continue; }
        if !is_valid_column(key) { continue; }

        let str_val = match val {
            Value::String(s) => s.clone(),
            Value::Null => {
                set_clauses.push(format!("{} = NULL", key));
                continue;
            }
            Value::Array(_) | Value::Object(_) => serde_json::to_string(val).unwrap_or_default(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => if *b { "1".to_string() } else { "0".to_string() },
        };

        set_clauses.push(format!("{} = ?{}", key, values.len() + 1));
        values.push(str_val);
    }

    if !set_clauses.iter().any(|c| c.starts_with("updated_at")) {
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        set_clauses.push(format!("updated_at = ?{}", values.len() + 1));
        values.push(now);
    }

    if set_clauses.is_empty() {
        return Err("No fields to update".to_string());
    }

    values.push(id.clone());
    let sql = format!(
        "UPDATE {} SET {} WHERE id = ?{}",
        table,
        set_clauses.join(", "),
        values.len()
    );

    let params: Vec<&dyn rusqlite::types::ToSql> = values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    conn.execute(&sql, params.as_slice()).map_err(|e| e.to_string())?;

    drop(conn);
    db_get_by_id(db, table, id)?
        .ok_or_else(|| "Update succeeded but row not found".to_string())
}

/// Generic: delete a row by id
#[tauri::command]
pub fn db_delete(
    db: State<Database>,
    table: String,
    id: String,
) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if !is_valid_table(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    if table == "audit_logs" {
        return Err("Audit logs are append-only and cannot be deleted".to_string());
    }

    let affected = conn.execute(
        &format!("DELETE FROM {} WHERE id = ?1", table),
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    Ok(affected > 0)
}

/// Atomic upsert: INSERT or UPDATE in a single statement (no TOCTOU race).
#[tauri::command]
pub fn db_upsert(
    db: State<Database>,
    table: String,
    id: String,
    data: Value,
) -> Result<Value, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if !is_valid_table(&table) {
        return Err(format!("Invalid table: {}", table));
    }

    let obj = data.as_object().ok_or("data must be a JSON object")?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    let mut columns = vec!["id".to_string()];
    let mut placeholders = vec!["?1".to_string()];
    let mut update_clauses: Vec<String> = Vec::new();
    let mut values: Vec<String> = vec![id.clone()];
    let mut param_idx: usize = 2;

    for (key, val) in obj.iter() {
        if key == "id" { continue; }
        if !is_valid_column(key) { continue; }

        let str_val = match val {
            Value::String(s) => s.clone(),
            Value::Null => continue,
            Value::Array(_) | Value::Object(_) => serde_json::to_string(val).unwrap_or_default(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => if *b { "1".to_string() } else { "0".to_string() },
        };

        columns.push(key.clone());
        placeholders.push(format!("?{}", param_idx));
        update_clauses.push(format!("{} = ?{}", key, param_idx));
        values.push(str_val);
        param_idx += 1;
    }

    // Add timestamps
    if !columns.contains(&"created_at".to_string()) {
        columns.push("created_at".to_string());
        placeholders.push(format!("?{}", param_idx));
        values.push(now.clone());
        param_idx += 1;
    }
    if !columns.contains(&"updated_at".to_string()) {
        columns.push("updated_at".to_string());
        placeholders.push(format!("?{}", param_idx));
        update_clauses.push(format!("updated_at = ?{}", param_idx));
        values.push(now);
    }

    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}",
        table,
        columns.join(", "),
        placeholders.join(", "),
        update_clauses.join(", ")
    );

    let params: Vec<&dyn rusqlite::types::ToSql> = values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    conn.execute(&sql, params.as_slice()).map_err(|_| "Upsert failed".to_string())?;

    drop(conn);
    db_get_by_id(db, table, id)?
        .ok_or_else(|| "Upsert succeeded but row not found".to_string())
}

/// Run a read-only SELECT query (for complex joins, aggregations, etc.)
/// Rejects non-SELECT statements and statements with semicolons (multi-statement).
#[tauri::command]
pub fn db_query(
    db: State<Database>,
    sql: String,
    params_json: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let trimmed = sql.trim().to_uppercase();
    if !trimmed.starts_with("SELECT") {
        return Err("Only SELECT queries are allowed via db_query".to_string());
    }
    // Block multi-statement injection (e.g., "SELECT 1; DROP TABLE users")
    if sql.contains(';') {
        return Err("Multi-statement queries are not allowed".to_string());
    }

    let param_values = params_json.unwrap_or_default();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let rows = stmt.query_map(params.as_slice(), |row| {
        row_to_json(row, &column_names)
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

/// Execute a restricted write query. Only INSERT, UPDATE, DELETE on whitelisted tables.
/// Rejects DDL, PRAGMA, multi-statement, and any non-DML operation.
#[tauri::command]
pub fn db_execute(
    db: State<Database>,
    sql: String,
    params_json: Option<Vec<String>>,
) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Block multi-statement injection
    if sql.contains(';') {
        return Err("Multi-statement queries are not allowed".to_string());
    }

    // Only allow INSERT, UPDATE, DELETE
    let trimmed = sql.trim().to_uppercase();
    if !trimmed.starts_with("INSERT") && !trimmed.starts_with("UPDATE")
        && !trimmed.starts_with("DELETE") {
        return Err("Only INSERT, UPDATE, DELETE are allowed via db_execute".to_string());
    }

    // Validate that the target table is whitelisted
    // Extract table name: INSERT INTO <table>, UPDATE <table>, DELETE FROM <table>
    let table_name = extract_table_from_dml(&trimmed)
        .ok_or("Could not determine target table from SQL")?;
    if !is_valid_table(&table_name) {
        return Err(format!("Invalid table in SQL: {}", table_name));
    }

    // Audit logs are append-only — reject UPDATE and DELETE
    if table_name == "audit_logs" && !trimmed.starts_with("INSERT") {
        return Err("Audit logs are append-only: only INSERT is allowed".to_string());
    }

    let param_values = params_json.unwrap_or_default();
    let params: Vec<&dyn rusqlite::types::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    conn.execute(&sql, params.as_slice()).map_err(|e| e.to_string())
}

// ---- Helpers ----

/// Convert a rusqlite Row to a serde_json Value
fn row_to_json(row: &rusqlite::Row, column_names: &[String]) -> rusqlite::Result<Value> {
    let mut map = serde_json::Map::new();
    for (i, name) in column_names.iter().enumerate() {
        let val: rusqlite::Result<Option<String>> = row.get(i);
        match val {
            Ok(Some(s)) => {
                if let Ok(json_val) = serde_json::from_str::<Value>(&s) {
                    if json_val.is_array() || json_val.is_object() {
                        map.insert(name.clone(), json_val);
                        continue;
                    }
                }
                map.insert(name.clone(), Value::String(s));
            }
            Ok(None) => {
                map.insert(name.clone(), Value::Null);
            }
            Err(_) => {
                if let Ok(Some(f)) = row.get::<_, Option<f64>>(i) {
                    map.insert(name.clone(), serde_json::json!(f));
                } else if let Ok(Some(n)) = row.get::<_, Option<i64>>(i) {
                    map.insert(name.clone(), serde_json::json!(n));
                } else {
                    map.insert(name.clone(), Value::Null);
                }
            }
        }
    }
    Ok(Value::Object(map))
}

/// Extract the table name from a DML statement (INSERT INTO x, UPDATE x, DELETE FROM x)
fn extract_table_from_dml(upper_sql: &str) -> Option<String> {
    let words: Vec<&str> = upper_sql.split_whitespace().collect();
    if words.len() < 2 { return None; }

    let table_word = if words[0] == "INSERT" && words.len() > 2 && words[1] == "INTO" {
        words[2]
    } else if words[0] == "UPDATE" {
        words[1]
    } else if words[0] == "DELETE" && words.len() > 2 && words[1] == "FROM" {
        words[2]
    } else {
        return None;
    };

    // Strip any trailing parentheses or whitespace artifacts
    Some(table_word.trim_matches(|c: char| !c.is_alphanumeric() && c != '_').to_lowercase())
}

// ---- Table/column whitelist for SQL injection prevention ----

const VALID_TABLES: &[&str] = &[
    "clients", "projects", "suppliers", "rfps", "packages",
    "change_orders", "risks", "todos", "deliveries", "contracts",
    "questions", "notes", "proposals", "schedules", "schedule_packages",
    "templates", "audit_logs", "app_config", "users",
    "coverage", "prequalifications", "rfp_questions", "activity_comments", "invites",
];

fn is_valid_table(name: &str) -> bool {
    VALID_TABLES.iter().any(|t| t.eq_ignore_ascii_case(name))
}

fn is_valid_column(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_alphanumeric() || c == '_')
}
