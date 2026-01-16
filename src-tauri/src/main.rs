#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use rand_core::OsRng;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Serialize)]
struct AppError {
  code: String,
  message: String,
}

type AppResult<T> = Result<T, AppError>;

impl AppError {
  fn new(code: &str, message: impl Into<String>) -> Self {
    Self {
      code: code.to_string(),
      message: message.into(),
    }
  }
}

impl From<rusqlite::Error> for AppError {
  fn from(err: rusqlite::Error) -> Self {
    AppError::new("db_error", err.to_string())
  }
}

impl From<argon2::password_hash::Error> for AppError {
  fn from(err: argon2::password_hash::Error) -> Self {
    AppError::new("password_error", err.to_string())
  }
}

#[derive(Default)]
struct AppState {
  db_path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapStatus {
  has_any_user: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserInfo {
  id: String,
  name: String,
  email: String,
  role: String,
  status: String,
  last_login_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
  id: String,
  user_id: String,
  created_at: String,
  expires_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
  user: UserInfo,
  session: SessionInfo,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSummary {
  id: String,
  name: String,
  email: String,
  role: String,
  status: String,
  created_at: String,
  updated_at: String,
  last_login_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserDetail {
  id: String,
  name: String,
  email: String,
  role: String,
  status: String,
  created_at: String,
  updated_at: String,
  last_login_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateInitialAdminPayload {
  name: String,
  email: String,
  password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginPayload {
  email: String,
  password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsersListFilters {
  q: Option<String>,
  role: Option<String>,
  status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserPayload {
  name: String,
  email: String,
  role: String,
  password_initial: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUserPayload {
  name: String,
  email: String,
  role: String,
}

#[derive(Debug)]
struct SessionRow {
  id: String,
  user_id: String,
  expires_at: String,
  revoked_at: Option<String>,
}

fn now_iso() -> String {
  Utc::now().to_rfc3339()
}

fn db_path(app: &AppHandle, state: &State<'_, AppState>) -> AppResult<PathBuf> {
  let mut guard = state
    .db_path
    .lock()
    .map_err(|_| AppError::new("state_error", "Falha ao acessar estado."))?;
  if let Some(path) = guard.as_ref() {
    return Ok(path.clone());
  }

  let base_dir = app
    .path_resolver()
    .app_data_dir()
    .ok_or_else(|| AppError::new("path_error", "Não foi possível localizar app_data."))?;
  fs::create_dir_all(&base_dir)
    .map_err(|err| AppError::new("fs_error", err.to_string()))?;
  let path = base_dir.join("db.sqlite");
  *guard = Some(path.clone());
  Ok(path)
}

fn open_connection(path: &Path) -> AppResult<Connection> {
  let conn = Connection::open(path)?;
  conn.execute_batch("PRAGMA foreign_keys = ON;")?;
  Ok(conn)
}

fn run_migrations(conn: &Connection) -> AppResult<()> {
  conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);",
  )?;

  let migrations = vec![
    (
      "0001_init",
      "\
      CREATE TABLE IF NOT EXISTS USERS(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );
      CREATE TABLE IF NOT EXISTS SESSIONS(
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS AUDIT_LOG(
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        summary TEXT,
        metadata_json TEXT
      );
      CREATE TABLE IF NOT EXISTS APP_CONFIG(
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT
      );
      ",
    ),
  ];

  for (id, sql) in migrations {
    let exists: Option<String> = conn
      .query_row(
        "SELECT id FROM schema_migrations WHERE id = ?1",
        params![id],
        |row| row.get(0),
      )
      .optional()?;

    if exists.is_none() {
      conn.execute_batch(sql)?;
      conn.execute(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (?1, ?2)",
        params![id, now_iso()],
      )?;
    }
  }

  Ok(())
}

fn hash_password(password: &str) -> AppResult<(String, String)> {
  let salt = SaltString::generate(&mut OsRng);
  let argon2 = Argon2::default();
  let hash = argon2.hash_password(password.as_bytes(), &salt)?.to_string();
  Ok((hash, salt.to_string()))
}

fn verify_password(password: &str, hash: &str) -> AppResult<bool> {
  let parsed_hash = PasswordHash::new(hash)?;
  Ok(Argon2::default()
    .verify_password(password.as_bytes(), &parsed_hash)
    .is_ok())
}

fn require_active_session(conn: &Connection, session_id: &str) -> AppResult<SessionRow> {
  let mut stmt = conn.prepare(
    "SELECT id, user_id, expires_at, revoked_at FROM SESSIONS WHERE id = ?1",
  )?;
  let session = stmt.query_row(params![session_id], |row| {
    Ok(SessionRow {
      id: row.get(0)?,
      user_id: row.get(1)?,
      expires_at: row.get(2)?,
      revoked_at: row.get(3)?,
    })
  });

  let session = match session {
    Ok(session) => session,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::new("session_invalid", "Sessão inválida."))
    }
    Err(err) => return Err(err.into()),
  };

  if session.revoked_at.is_some() {
    return Err(AppError::new("session_revoked", "Sessão revogada."));
  }

  let expires_at = chrono::DateTime::parse_from_rfc3339(&session.expires_at)
    .map_err(|_| AppError::new("session_invalid", "Sessão expirada."))?
    .with_timezone(&Utc);
  if expires_at < Utc::now() {
    return Err(AppError::new("session_expired", "Sessão expirada."));
  }

  Ok(session)
}

fn require_admin_session(conn: &Connection, session_id: &str) -> AppResult<UserInfo> {
  let session = require_active_session(conn, session_id)?;
  let mut stmt = conn.prepare(
    "SELECT id, name, email, role, status, last_login_at FROM USERS WHERE id = ?1",
  )?;
  let user = stmt.query_row(params![session.user_id], |row| {
    Ok(UserInfo {
      id: row.get(0)?,
      name: row.get(1)?,
      email: row.get(2)?,
      role: row.get(3)?,
      status: row.get(4)?,
      last_login_at: row.get(5)?,
    })
  });

  let user = match user {
    Ok(user) => user,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::new("auth_invalid", "Usuário não encontrado."))
    }
    Err(err) => return Err(err.into()),
  };

  if user.status != "ACTIVE" {
    return Err(AppError::new("auth_invalid", "Usuário inativo."));
  }

  if user.role != "ADMIN" && user.role != "PARTNER" {
    return Err(AppError::new("auth_forbidden", "Sem permissão."));
  }

  Ok(user)
}

fn count_active_admins(conn: &Connection) -> AppResult<i64> {
  let count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM USERS WHERE role = 'ADMIN' AND status = 'ACTIVE'",
    [],
    |row| row.get(0),
  )?;
  Ok(count)
}

fn insert_audit_log(
  conn: &Connection,
  user_id: &str,
  action: &str,
  entity_type: Option<&str>,
  entity_id: Option<&str>,
  summary: Option<&str>,
  metadata_json: Option<&str>,
) -> AppResult<()> {
  conn.execute(
    "INSERT INTO AUDIT_LOG (id, timestamp, user_id, action, entity_type, entity_id, summary, metadata_json)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    params![
      Uuid::new_v4().to_string(),
      now_iso(),
      user_id,
      action,
      entity_type,
      entity_id,
      summary,
      metadata_json
    ],
  )?;
  Ok(())
}

#[tauri::command]
fn auth_get_bootstrap_status(app: AppHandle, state: State<'_, AppState>) -> AppResult<BootstrapStatus> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;

  let count: i64 = conn.query_row("SELECT COUNT(*) FROM USERS", [], |row| row.get(0))?;
  Ok(BootstrapStatus {
    has_any_user: count > 0,
  })
}

#[tauri::command]
fn auth_create_initial_admin(
  app: AppHandle,
  state: State<'_, AppState>,
  payload: CreateInitialAdminPayload,
) -> AppResult<AuthResponse> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;

  let count: i64 = conn.query_row("SELECT COUNT(*) FROM USERS", [], |row| row.get(0))?;
  if count > 0 {
    return Err(AppError::new(
      "bootstrap_complete",
      "Admin inicial já foi criado.",
    ));
  }

  let (password_hash, password_salt) = hash_password(&payload.password)?;
  let now = now_iso();
  let user_id = Uuid::new_v4().to_string();
  let name = payload.name.trim().to_string();
  let email = payload.email.trim().to_lowercase();
  conn.execute(
    "INSERT INTO USERS (id, name, email, role, status, password_hash, password_salt, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    params![
      user_id,
      name,
      email,
      "ADMIN",
      "ACTIVE",
      password_hash,
      password_salt,
      now,
      now
    ],
  )?;

  let session = create_session(&conn, &user_id)?;
  insert_audit_log(
    &conn,
    &user_id,
    "create_initial_admin",
    Some("USER"),
    Some(&user_id),
    Some("Admin inicial criado"),
    None,
  )?;

  Ok(AuthResponse {
    user: UserInfo {
      id: user_id.clone(),
      name,
      email,
      role: "ADMIN".to_string(),
      status: "ACTIVE".to_string(),
      last_login_at: None,
    },
    session,
  })
}

fn create_session(conn: &Connection, user_id: &str) -> AppResult<SessionInfo> {
  let session_id = Uuid::new_v4().to_string();
  let created_at = now_iso();
  let expires_at = (Utc::now() + Duration::hours(8)).to_rfc3339();
  conn.execute(
    "INSERT INTO SESSIONS (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
    params![session_id, user_id, created_at, expires_at],
  )?;

  Ok(SessionInfo {
    id: session_id,
    user_id: user_id.to_string(),
    created_at,
    expires_at,
  })
}

#[tauri::command]
fn auth_login(
  app: AppHandle,
  state: State<'_, AppState>,
  payload: LoginPayload,
) -> AppResult<AuthResponse> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;

  let email_lookup = payload.email.trim().to_lowercase();
  let mut stmt = conn.prepare(
    "SELECT id, name, email, role, status, password_hash FROM USERS WHERE email = ?1",
  )?;
  let result = stmt.query_row(params![email_lookup], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
    ))
  });

  let (id, name, email, role, status, password_hash) = match result {
    Ok(row) => row,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::new("auth_invalid", "Credenciais inválidas."))
    }
    Err(err) => return Err(err.into()),
  };

  if !verify_password(&payload.password, &password_hash)? {
    return Err(AppError::new("auth_invalid", "Credenciais inválidas."));
  }

  let session = create_session(&conn, &id)?;
  let now = now_iso();
  conn.execute(
    "UPDATE USERS SET last_login_at = ?1, updated_at = ?2 WHERE id = ?3",
    params![now, now, id],
  )?;

  insert_audit_log(
    &conn,
    &id,
    "login",
    Some("SESSION"),
    Some(&session.id),
    Some("Login realizado"),
    None,
  )?;

  Ok(AuthResponse {
    user: UserInfo {
      id,
      name,
      email,
      role,
      status,
      last_login_at: Some(now),
    },
    session,
  })
}

#[tauri::command]
fn auth_logout(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;

  let session = require_active_session(&conn, &session_id)?;
  let revoked_at = now_iso();
  conn.execute(
    "UPDATE SESSIONS SET revoked_at = ?1 WHERE id = ?2",
    params![revoked_at, session_id],
  )?;

  insert_audit_log(
    &conn,
    &session.user_id,
    "logout",
    Some("SESSION"),
    Some(&session.id),
    Some("Logout realizado"),
    None,
  )?;

  Ok(())
}

#[tauri::command]
fn auth_reauth_check(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  password: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;

  let session = require_active_session(&conn, &session_id)?;
  let mut stmt = conn.prepare("SELECT password_hash FROM USERS WHERE id = ?1")?;
  let hash = stmt
    .query_row(params![session.user_id], |row| row.get::<_, String>(0))
    .map_err(|_| AppError::new("auth_invalid", "Usuário não encontrado."))?;

  if !verify_password(&password, &hash)? {
    return Err(AppError::new("auth_invalid", "Senha inválida."));
  }

  Ok(())
}

#[tauri::command]
fn users_list(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  filters: UsersListFilters,
) -> AppResult<Vec<UserSummary>> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let mut sql = String::from(
    "SELECT id, name, email, role, status, created_at, updated_at, last_login_at FROM USERS WHERE 1=1",
  );
  let mut params: Vec<String> = Vec::new();

  if let Some(q) = filters.q {
    let needle = format!("%{}%", q.trim());
    sql.push_str(" AND (name LIKE ? OR email LIKE ?)");
    params.push(needle.clone());
    params.push(needle);
  }

  if let Some(role) = filters.role {
    sql.push_str(" AND role = ?");
    params.push(role);
  }

  if let Some(status) = filters.status {
    sql.push_str(" AND status = ?");
    params.push(status);
  }

  sql.push_str(" ORDER BY name ASC");

  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt.query_map(params_from_iter(params.iter()), |row| {
    Ok(UserSummary {
      id: row.get(0)?,
      name: row.get(1)?,
      email: row.get(2)?,
      role: row.get(3)?,
      status: row.get(4)?,
      created_at: row.get(5)?,
      updated_at: row.get(6)?,
      last_login_at: row.get(7)?,
    })
  })?;

  let mut users = Vec::new();
  for row in rows {
    users.push(row?);
  }

  Ok(users)
}

#[tauri::command]
fn users_get(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
) -> AppResult<UserDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, name, email, role, status, created_at, updated_at, last_login_at FROM USERS WHERE id = ?1",
  )?;
  let user = stmt.query_row(params![id], |row| {
    Ok(UserDetail {
      id: row.get(0)?,
      name: row.get(1)?,
      email: row.get(2)?,
      role: row.get(3)?,
      status: row.get(4)?,
      created_at: row.get(5)?,
      updated_at: row.get(6)?,
      last_login_at: row.get(7)?,
    })
  });

  match user {
    Ok(user) => Ok(user),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::new("not_found", "Usuário não encontrado."))
    }
    Err(err) => Err(err.into()),
  }
}

#[tauri::command]
fn users_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: CreateUserPayload,
) -> AppResult<UserDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let email = payload.email.trim().to_lowercase();
  let name = payload.name.trim().to_string();
  let role = payload.role.trim().to_uppercase();
  let status = "ACTIVE".to_string();
  let exists: Option<String> = conn
    .query_row("SELECT id FROM USERS WHERE email = ?1", params![email], |row| {
      row.get(0)
    })
    .optional()?;
  if exists.is_some() {
    return Err(AppError::new("email_in_use", "Email já cadastrado."));
  }

  let (password_hash, password_salt) = hash_password(&payload.password_initial)?;
  let now = now_iso();
  let user_id = Uuid::new_v4().to_string();
  conn.execute(
    "INSERT INTO USERS (id, name, email, role, status, password_hash, password_salt, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    params![
      user_id,
      name,
      email,
      role,
      status,
      password_hash,
      password_salt,
      now,
      now
    ],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "create_user",
    Some("USER"),
    Some(&user_id),
    Some("Usuário criado"),
    None,
  )?;

  Ok(UserDetail {
    id: user_id,
    name,
    email,
    role,
    status,
    created_at: now.clone(),
    updated_at: now,
    last_login_at: None,
  })
}

#[tauri::command]
fn users_update(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
  payload: UpdateUserPayload,
) -> AppResult<UserDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT role, status, created_at, last_login_at FROM USERS WHERE id = ?1",
  )?;
  let current = stmt.query_row(params![id.clone()], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, Option<String>>(3)?,
    ))
  });
  let (current_role, current_status, created_at, last_login_at) = match current {
    Ok(row) => row,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::new("not_found", "Usuário não encontrado."))
    }
    Err(err) => return Err(err.into()),
  };

  let name = payload.name.trim().to_string();
  let email = payload.email.trim().to_lowercase();
  let role = payload.role.trim().to_uppercase();

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM USERS WHERE email = ?1 AND id <> ?2",
      params![email, id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    return Err(AppError::new("email_in_use", "Email já cadastrado."));
  }

  if current_role == "ADMIN" && role != "ADMIN" && current_status == "ACTIVE" {
    let admins = count_active_admins(&conn)?;
    if admins <= 1 {
      return Err(AppError::new(
        "admin_lockout",
        "Não é permitido remover o último ADMIN ativo.",
      ));
    }
  }

  let now = now_iso();
  conn.execute(
    "UPDATE USERS SET name = ?1, email = ?2, role = ?3, updated_at = ?4 WHERE id = ?5",
    params![name, email, role, now, id],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "update_user",
    Some("USER"),
    Some(&id),
    Some("Usuário atualizado"),
    None,
  )?;

  Ok(UserDetail {
    id,
    name,
    email,
    role,
    status: current_status,
    created_at,
    updated_at: now,
    last_login_at,
  })
}

#[tauri::command]
fn users_set_status(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
  status: String,
) -> AppResult<UserDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT name, email, role, status, created_at, updated_at, last_login_at FROM USERS WHERE id = ?1",
  )?;
  let current = stmt.query_row(params![id.clone()], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, Option<String>>(6)?,
    ))
  });

  let (name, email, role, current_status, created_at, _updated_at, last_login_at) =
    match current {
      Ok(row) => row,
      Err(rusqlite::Error::QueryReturnedNoRows) => {
        return Err(AppError::new("not_found", "Usuário não encontrado."))
      }
      Err(err) => return Err(err.into()),
    };

  let next_status = status.trim().to_uppercase();
  if current_status == "ACTIVE" && next_status != "ACTIVE" && role == "ADMIN" {
    let admins = count_active_admins(&conn)?;
    if admins <= 1 {
      return Err(AppError::new(
        "admin_lockout",
        "Não é permitido inativar o último ADMIN ativo.",
      ));
    }
  }

  let now = now_iso();
  conn.execute(
    "UPDATE USERS SET status = ?1, updated_at = ?2 WHERE id = ?3",
    params![next_status, now, id],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "set_status",
    Some("USER"),
    Some(&id),
    Some("Status do usuário alterado"),
    None,
  )?;

  Ok(UserDetail {
    id,
    name,
    email,
    role,
    status: next_status,
    created_at,
    updated_at: now,
    last_login_at,
  })
}

#[tauri::command]
fn users_reset_password(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
  new_password: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let (password_hash, password_salt) = hash_password(&new_password)?;
  let now = now_iso();
  let affected = conn.execute(
    "UPDATE USERS SET password_hash = ?1, password_salt = ?2, updated_at = ?3 WHERE id = ?4",
    params![password_hash, password_salt, now, id],
  )?;
  if affected == 0 {
    return Err(AppError::new("not_found", "Usuário não encontrado."));
  }

  insert_audit_log(
    &conn,
    &admin.id,
    "reset_password",
    Some("USER"),
    Some(&id),
    Some("Senha redefinida"),
    None,
  )?;

  Ok(())
}

fn main() {
  tauri::Builder::default()
    .manage(AppState::default())
    .setup(|app| {
      let state: State<'_, AppState> = app.state();
      let path = db_path(app, &state)?;
      let conn = open_connection(&path)?;
      run_migrations(&conn)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      auth_get_bootstrap_status,
      auth_create_initial_admin,
      auth_login,
      auth_logout,
      auth_reauth_check,
      users_list,
      users_get,
      users_create,
      users_update,
      users_set_status,
      users_reset_password
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
