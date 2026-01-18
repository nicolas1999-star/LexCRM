#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::fmt;

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

impl fmt::Display for AppError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "{}: {}", self.code, self.message)
  }
}

impl std::error::Error for AppError {}

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

impl From<std::io::Error> for AppError {
  fn from(err: std::io::Error) -> Self {
    AppError::new("io_error", err.to_string())
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Team {
  id: String,
  name: String,
  description: Option<String>,
  lead_user_id: Option<String>,
  lead_name: Option<String>,
  lead_email: Option<String>,
  member_count: i64,
  member_user_ids: Vec<String>,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientSummary {
  id: String,
  #[serde(rename = "type")]
  client_type: String,
  name: String,
  cpf_cnpj: String,
  status: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientDetail {
  id: String,
  #[serde(rename = "type")]
  client_type: String,
  name: String,
  cpf_cnpj: String,
  email: Option<String>,
  phone: Option<String>,
  notes: Option<String>,
  status: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaseSummary {
  id: String,
  client_id: String,
  identifier_type: String,
  identifier: String,
  court_city: Option<String>,
  court_unit: Option<String>,
  panel: Option<String>,
  rapporteur: Option<String>,
  distributed_at: Option<String>,
  closed_at: Option<String>,
  area: Option<String>,
  phase: Option<String>,
  value_amount: Option<f64>,
  documents_path: Option<String>,
struct AttendanceSummary {
  id: String,
  client_id: String,
  occurred_at: String,
  channel: String,
  subject: String,
  notes: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaseDetail {
  id: String,
  client_id: String,
  identifier_type: String,
  identifier: String,
  court_city: Option<String>,
  court_unit: Option<String>,
  panel: Option<String>,
  rapporteur: Option<String>,
  distributed_at: Option<String>,
  closed_at: Option<String>,
  area: Option<String>,
  phase: Option<String>,
  value_amount: Option<f64>,
  documents_path: Option<String>,
struct AttendanceDetail {
  id: String,
  client_id: String,
  occurred_at: String,
  channel: String,
  subject: String,
  notes: String,
  created_at: String,
  updated_at: String,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTeamPayload {
  name: String,
  description: Option<String>,
  lead_user_id: Option<String>,
  member_user_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTeamPayload {
  name: String,
  description: Option<String>,
  lead_user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientsListFilters {
  q: Option<String>,
  #[serde(rename = "type")]
  client_type: Option<String>,
  status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateClientPayload {
  #[serde(rename = "type")]
  client_type: String,
  name: String,
  cpf_cnpj: String,
  email: Option<String>,
  phone: Option<String>,
  notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateClientPayload {
  #[serde(rename = "type")]
  client_type: String,
  name: String,
  cpf_cnpj: String,
  email: Option<String>,
  phone: Option<String>,
  notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCasePayload {
  client_id: String,
  identifier_type: String,
  identifier: String,
  court_city: Option<String>,
  court_unit: Option<String>,
  panel: Option<String>,
  rapporteur: Option<String>,
  distributed_at: Option<String>,
  closed_at: Option<String>,
  area: Option<String>,
  phase: Option<String>,
  value_amount: Option<f64>,
  documents_path: Option<String>,
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppointmentSummary {
  id: String,
  client_name: String,
  client_document: String,
  client_email: Option<String>,
  client_phone: Option<String>,
  title: String,
  attendance_date: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppointmentDetail {
  id: String,
  client_name: String,
  client_document: String,
  client_email: Option<String>,
  client_phone: Option<String>,
  title: String,
  attendance_date: String,
  history: String,
  analysis: String,
  conclusion: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAppointmentPayload {
  client_name: String,
  client_document: String,
  client_email: Option<String>,
  client_phone: Option<String>,
  title: String,
  attendance_date: String,
  history: String,
  analysis: String,
  conclusion: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAttendancePayload {
  occurred_at: String,
  channel: String,
  subject: String,
  notes: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAttendancePayload {
  occurred_at: String,
  channel: String,
  subject: String,
  notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentGeneratePayload {
  document_type: String,
  office_name: String,
  generated_at: String,
  client_name: String,
  client_document: String,
  client_email: Option<String>,
  client_phone: Option<String>,
  title: String,
  attendance_date: String,
  history: String,
  analysis: String,
  conclusion: String,
  appointment_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentHtmlResponse {
  html: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentExportHtmlPayload {
  html: String,
  file_path: String,
  document_type: String,
  appointment_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCasePayload {
  identifier_type: String,
  identifier: String,
  court_city: Option<String>,
  court_unit: Option<String>,
  panel: Option<String>,
  rapporteur: Option<String>,
  distributed_at: Option<String>,
  closed_at: Option<String>,
  area: Option<String>,
  phase: Option<String>,
  value_amount: Option<f64>,
  documents_path: Option<String>,
struct DocumentLogExportPayload {
  document_type: String,
  appointment_id: Option<String>,
  format: String,
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
    (
      "0002_teams",
      "\
      CREATE TABLE IF NOT EXISTS TEAMS(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        lead_user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS TEAM_MEMBERS(
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(team_id, user_id)
      );
      ",
    ),
    (
      "0003_clients",
      "\
      CREATE TABLE IF NOT EXISTS CLIENTS(
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        cpf_cnpj TEXT NOT NULL UNIQUE,
        email TEXT,
        phone TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ",
    ),
    (
      "0005_cases",
      "\
      CREATE TABLE IF NOT EXISTS CASES(
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        identifier_type TEXT NOT NULL,
        identifier TEXT NOT NULL,
        court_city TEXT,
        court_unit TEXT,
        panel TEXT,
        rapporteur TEXT,
        distributed_at TEXT,
        closed_at TEXT,
        area TEXT,
        phase TEXT,
        value_amount REAL,
        documents_path TEXT,
      "0004_appointments",
      "\
      CREATE TABLE IF NOT EXISTS APPOINTMENTS(
        id TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        client_document TEXT NOT NULL,
        client_email TEXT,
        client_phone TEXT,
        title TEXT NOT NULL,
        attendance_date TEXT NOT NULL,
        history TEXT NOT NULL,
        analysis TEXT NOT NULL,
        conclusion TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      "0004_attendances",
      "\
      CREATE TABLE IF NOT EXISTS ATTENDANCES(
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        channel TEXT NOT NULL,
        subject TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES CLIENTS(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cases_client_id ON CASES(client_id);
      CREATE INDEX IF NOT EXISTS idx_cases_identifier ON CASES(identifier);
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

fn only_digits(value: &str) -> String {
  value.chars().filter(|c| c.is_ascii_digit()).collect()
}

fn is_valid_cpf(value: &str) -> bool {
  if value.len() != 11 {
    return false;
  }
  if value.chars().all(|c| c == value.chars().next().unwrap_or(' ')) {
    return false;
  }
  let digits: Vec<u32> = value.chars().filter_map(|c| c.to_digit(10)).collect();
  if digits.len() != 11 {
    return false;
  }
  let mut sum = 0;
  for i in 0..9 {
    sum += digits[i] * (10 - i as u32);
  }
  let mut first = (sum * 10) % 11;
  if first == 10 {
    first = 0;
  }
  if digits[9] != first {
    return false;
  }
  sum = 0;
  for i in 0..10 {
    sum += digits[i] * (11 - i as u32);
  }
  let mut second = (sum * 10) % 11;
  if second == 10 {
    second = 0;
  }
  digits[10] == second
}

fn is_valid_cnpj(value: &str) -> bool {
  if value.len() != 14 {
    return false;
  }
  if value.chars().all(|c| c == value.chars().next().unwrap_or(' ')) {
    return false;
  }
  let digits: Vec<u32> = value.chars().filter_map(|c| c.to_digit(10)).collect();
  if digits.len() != 14 {
    return false;
  }
  let weights_first = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let weights_second = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let mut sum = 0;
  for i in 0..12 {
    sum += digits[i] * weights_first[i];
  }
  let mut remainder = sum % 11;
  let first = if remainder < 2 { 0 } else { 11 - remainder };
  if digits[12] != first {
    return false;
  }
  sum = 0;
  for i in 0..13 {
    sum += digits[i] * weights_second[i];
  }
  remainder = sum % 11;
  let second = if remainder < 2 { 0 } else { 11 - remainder };
  digits[13] == second
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

fn escape_html(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
    .replace('\'', "&#39;")
}

fn text_to_paragraphs(value: &str) -> String {
  let escaped = escape_html(value.trim());
  let chunks: Vec<&str> = escaped.split("\n\n").collect();
  let mut paragraphs = Vec::new();
  for chunk in chunks {
    let trimmed = chunk.trim();
    if trimmed.is_empty() {
      continue;
    }
    let line_breaks = trimmed.replace('\n', "<br />");
    paragraphs.push(format!("<p>{}</p>", line_breaks));
  }
  if paragraphs.is_empty() {
    "<p></p>".to_string()
  } else {
    paragraphs.join("\n")
  }
}

fn document_title(document_type: &str) -> String {
  match document_type {
    "PARECER" => "Parecer",
    _ => "Relatório de atendimento",
  }
  .to_string()
}

fn build_document_html(payload: &DocumentGeneratePayload) -> String {
  let office_name = escape_html(payload.office_name.trim());
  let client_name = escape_html(payload.client_name.trim());
  let client_document = escape_html(payload.client_document.trim());
  let client_email = payload
    .client_email
    .as_deref()
    .map(|value| escape_html(value.trim()));
  let client_phone = payload
    .client_phone
    .as_deref()
    .map(|value| escape_html(value.trim()));
  let title = escape_html(payload.title.trim());
  let attendance_date = escape_html(payload.attendance_date.trim());
  let generated_at = escape_html(payload.generated_at.trim());
  let history_html = text_to_paragraphs(&payload.history);
  let analysis_html = text_to_paragraphs(&payload.analysis);
  let conclusion_html = text_to_paragraphs(&payload.conclusion);
  let document_title = document_title(payload.document_type.trim());

  let mut client_lines = vec![
    format!("<strong>Cliente:</strong> {}", client_name),
    format!("<strong>CPF/CNPJ:</strong> {}", client_document),
  ];
  if let Some(email) = client_email {
    if !email.is_empty() {
      client_lines.push(format!("<strong>Email:</strong> {}", email));
    }
  }
  if let Some(phone) = client_phone {
    if !phone.is_empty() {
      client_lines.push(format!("<strong>Telefone:</strong> {}", phone));
    }
  }

  format!(
    r#"<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>{document_title}</title>
    <style>
      :root {{
        --text-color: #1c1c1c;
        --muted-color: #4f4f4f;
      }}
      body {{
        font-family: "Times New Roman", "Georgia", serif;
        font-size: 12pt;
        line-height: 1.5;
        color: var(--text-color);
        margin: 2.5cm 2cm 2.5cm 3cm;
      }}
      header {{
        text-align: center;
        margin-bottom: 28px;
      }}
      header .office {{
        font-size: 13pt;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }}
      header .title {{
        margin-top: 18px;
        font-size: 14pt;
        font-weight: 600;
      }}
      header .meta {{
        margin-top: 14px;
        color: var(--muted-color);
        font-size: 11pt;
      }}
      .section {{
        margin-bottom: 18px;
      }}
      .section h2 {{
        font-size: 12pt;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        margin-bottom: 8px;
      }}
      .section p {{
        margin: 0 0 8px 0;
        text-align: justify;
      }}
      .section .identification {{
        margin-top: 6px;
        color: var(--muted-color);
      }}
      .signature {{
        margin-top: 36px;
        text-align: center;
      }}
      .signature .line {{
        display: inline-block;
        width: 70%;
        border-top: 1px solid #555;
        margin-top: 40px;
      }}
      .signature .label {{
        margin-top: 8px;
        color: var(--muted-color);
      }}
    </style>
  </head>
  <body>
    <header>
      <div class="office">{office_name}</div>
      <div class="title">{document_title}</div>
      <div class="meta">Data: {generated_at}</div>
    </header>

    <section class="section">
      <h2>Identificação</h2>
      <p><strong>Assunto:</strong> {title}</p>
      <p><strong>Data do atendimento:</strong> {attendance_date}</p>
      <div class="identification">
        {client_lines}
      </div>
    </section>

    <section class="section">
      <h2>Histórico</h2>
      {history_html}
    </section>

    <section class="section">
      <h2>Análise</h2>
      {analysis_html}
    </section>

    <section class="section">
      <h2>Conclusão</h2>
      {conclusion_html}
    </section>

    <section class="section signature">
      <div class="line"></div>
      <div class="label">Assinatura</div>
    </section>
  </body>
</html>"#,
    document_title = escape_html(&document_title),
    office_name = office_name,
    generated_at = generated_at,
    title = title,
    attendance_date = attendance_date,
    client_lines = client_lines.join("<br />"),
    history_html = history_html,
    analysis_html = analysis_html,
    conclusion_html = conclusion_html
  )
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

#[tauri::command]
fn teams_list(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
) -> AppResult<Vec<Team>> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT t.id, t.name, t.description, t.lead_user_id, u.name, u.email, t.created_at, t.updated_at
     FROM TEAMS t
     LEFT JOIN USERS u ON t.lead_user_id = u.id
     ORDER BY t.name ASC",
  )?;
  let rows = stmt.query_map([], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, Option<String>>(2)?,
      row.get::<_, Option<String>>(3)?,
      row.get::<_, Option<String>>(4)?,
      row.get::<_, Option<String>>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
    ))
  })?;

  let mut teams = Vec::new();
  for row in rows {
    let (id, name, description, lead_user_id, lead_name, lead_email, created_at, updated_at) =
      row?;
    let mut members_stmt =
      conn.prepare("SELECT user_id FROM TEAM_MEMBERS WHERE team_id = ?1")?;
    let member_rows = members_stmt.query_map(params![id.clone()], |member_row| {
      member_row.get::<_, String>(0)
    })?;
    let mut member_user_ids = Vec::new();
    for member_id in member_rows {
      member_user_ids.push(member_id?);
    }

    let member_count = member_user_ids.len() as i64;
    teams.push(Team {
      id,
      name,
      description,
      lead_user_id,
      lead_name,
      lead_email,
      member_count,
      member_user_ids,
      created_at,
      updated_at,
    });
  }

  Ok(teams)
}

#[tauri::command]
fn teams_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: CreateTeamPayload,
) -> AppResult<Team> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  
  let name = payload.name.trim().to_string();
  if name.is_empty() {
    return Err(AppError::new("validation_error", "Nome é obrigatório."));
  }
  let description = payload.description.map(|value| value.trim().to_string());
  let lead_user_id = payload.lead_user_id.filter(|value| !value.trim().is_empty());

  let exists: Option<String> = conn
    .query_row("SELECT id FROM TEAMS WHERE name = ?1", params![name], |row| {
      row.get(0)
    })
    .optional()?;
  if exists.is_some() {
    return Err(AppError::new("name_in_use", "Nome de equipe já existe."));
  }

  let team_id = Uuid::new_v4().to_string();
  let now = now_iso();

  conn.execute(
    "INSERT INTO TEAMS (id, name, description, lead_user_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    params![
      team_id,
      name,
      description.clone(),
      lead_user_id.clone(),
      now,
      now
    ],
  )?;

  let mut member_user_ids = payload.member_user_ids;
  member_user_ids.sort();
  member_user_ids.dedup();
  for user_id in &member_user_ids {
    conn.execute(
      "INSERT INTO TEAM_MEMBERS (team_id, user_id, created_at) VALUES (?1, ?2, ?3)",
      params![team_id, user_id, now],
    )?;
  }

  insert_audit_log(
    &conn,
    &admin.id,
    "create_team",
    Some("TEAM"),
    Some(&team_id),
    Some("Equipe criada"),
    None,
  )?;

  Ok(Team {
    id: team_id,
    name,
    description,
    lead_user_id: lead_user_id.clone(),
    lead_name: None,
    lead_email: None,
    member_count: member_user_ids.len() as i64,
    member_user_ids,
    created_at: now.clone(),
    updated_at: now,
  })
}

#[tauri::command]
fn teams_update(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
  payload: UpdateTeamPayload,
) -> AppResult<Team> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let created_at: String = conn
    .query_row(
      "SELECT created_at FROM TEAMS WHERE id = ?1",
      params![id.clone()],
      |row| row.get(0),
    )
    .map_err(|_| AppError::new("not_found", "Equipe não encontrada."))?;

  let name = payload.name.trim().to_string();
  if name.is_empty() {
    return Err(AppError::new("validation_error", "Nome é obrigatório."));
  }
  let description = payload.description.map(|value| value.trim().to_string());
  let lead_user_id = payload.lead_user_id.filter(|value| !value.trim().is_empty());

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM TEAMS WHERE name = ?1 AND id <> ?2",
      params![name, id.clone()],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    return Err(AppError::new("name_in_use", "Nome de equipe já existe."));
  }

  let now = now_iso();
  let affected = conn.execute(
    "UPDATE TEAMS SET name = ?1, description = ?2, lead_user_id = ?3, updated_at = ?4 WHERE id = ?5",
    params![name, description.clone(), lead_user_id.clone(), now, id.clone()],
  )?;
  if affected == 0 {
    return Err(AppError::new("not_found", "Equipe não encontrada."));
  }

  insert_audit_log(
    &conn,
    &admin.id,
    "update_team",
    Some("TEAM"),
    Some(&id),
    Some("Equipe atualizada"),
    None,
  )?;

  let mut members_stmt =
    conn.prepare("SELECT user_id FROM TEAM_MEMBERS WHERE team_id = ?1")?;
  let member_rows = members_stmt.query_map(params![id.clone()], |row| row.get::<_, String>(0))?;
  let mut member_user_ids = Vec::new();
  for member_id in member_rows {
    member_user_ids.push(member_id?);
  }

  Ok(Team {
    id,
    name,
    description,
    lead_user_id,
    lead_name: None,
    lead_email: None,
    member_count: member_user_ids.len() as i64,
    member_user_ids,
    created_at,
    updated_at: now,
  })
}

#[tauri::command]
fn teams_set_members(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  team_id: String,
  user_ids: Vec<String>,
) -> AppResult<Team> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM TEAMS WHERE id = ?1",
      params![team_id.clone()],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("not_found", "Equipe não encontrada."));
  }

  let now = now_iso();
  conn.execute(
    "DELETE FROM TEAM_MEMBERS WHERE team_id = ?1",
    params![team_id.clone()],
  )?;

  let mut member_user_ids = user_ids;
  member_user_ids.sort();
  member_user_ids.dedup();
  for user_id in &member_user_ids {
    conn.execute(
      "INSERT INTO TEAM_MEMBERS (team_id, user_id, created_at) VALUES (?1, ?2, ?3)",
      params![team_id, user_id, now],
    )?;
  }

  conn.execute(
    "UPDATE TEAMS SET updated_at = ?1 WHERE id = ?2",
    params![now, team_id.clone()],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "update_team_members",
    Some("TEAM"),
    Some(&team_id),
    Some("Membros atualizados"),
    None,
  )?;

  let mut team_stmt = conn.prepare(
    "SELECT name, description, lead_user_id, created_at, updated_at FROM TEAMS WHERE id = ?1",
  )?;
  let team_row = team_stmt.query_row(params![team_id.clone()], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, Option<String>>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
    ))
  })?;

  Ok(Team {
    id: team_id,
    name: team_row.0,
    description: team_row.1,
    lead_user_id: team_row.2,
    lead_name: None,
    lead_email: None,
    member_count: member_user_ids.len() as i64,
    member_user_ids,
    created_at: team_row.3,
    updated_at: team_row.4,
  })
}

#[tauri::command]
fn teams_delete_or_archive(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let exists: Option<String> = conn
    .query_row("SELECT id FROM TEAMS WHERE id = ?1", params![id.clone()], |row| {
      row.get(0)
    })
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("not_found", "Equipe não encontrada."));
  }

  let members_count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM TEAM_MEMBERS WHERE team_id = ?1",
    params![id.clone()],
    |row| row.get(0),
  )?;
  if members_count > 0 {
    insert_audit_log(
      &conn,
      &admin.id,
      "delete_attempt",
      Some("TEAM"),
      Some(&id),
      Some("Tentativa de exclusão bloqueada (equipe com membros)"),
      None,
    )?;
    return Err(AppError::new(
      "team_has_members",
      "Não é possível excluir equipes com membros.",
    ));
  }

  insert_audit_log(
    &conn,
    &admin.id,
    "delete_attempt",
    Some("TEAM"),
    Some(&id),
    Some("Equipe removida"),
    None,
  )?;

  conn.execute(
    "DELETE FROM TEAM_MEMBERS WHERE team_id = ?1",
    params![id.clone()],
  )?;
  conn.execute("DELETE FROM TEAMS WHERE id = ?1", params![id])?;
  Ok(())
}

fn normalize_client_type(value: &str) -> String {
  value.trim().to_uppercase()
}

fn normalize_optional_field(value: Option<String>) -> Option<String> {
  value
    .map(|field| field.trim().to_string())
    .filter(|field| !field.is_empty())
}

fn validate_client_payload(client_type: &str, name: &str, cpf_cnpj: &str) -> AppResult<()> {
  if client_type.is_empty() {
    return Err(AppError::new("validation_error", "Tipo é obrigatório."));
  }
  if client_type != "PF" && client_type != "PJ" {
    return Err(AppError::new("validation_error", "Tipo inválido."));
  }
  if name.is_empty() {
    return Err(AppError::new("validation_error", "Nome é obrigatório."));
  }
  if cpf_cnpj.is_empty() {
    return Err(AppError::new("validation_error", "CPF/CNPJ é obrigatório."));
  }
  if client_type == "PF" && !is_valid_cpf(cpf_cnpj) {
    return Err(AppError::new("validation_error", "CPF inválido."));
  }
  if client_type == "PJ" && !is_valid_cnpj(cpf_cnpj) {
    return Err(AppError::new("validation_error", "CNPJ inválido."));
  }
  Ok(())
}

fn normalize_identifier_type(value: &str) -> String {
  value.trim().to_uppercase()
}

fn validate_case_payload(identifier_type: &str, identifier: &str) -> AppResult<()> {
  if identifier_type.is_empty() {
    return Err(AppError::new(
      "validation_error",
      "Tipo do identificador é obrigatório.",
    ));
  }
  if identifier_type != "CNJ" && identifier_type != "ADM" && identifier_type != "OUTRO" {
    return Err(AppError::new(
      "validation_error",
      "Tipo do identificador inválido.",
    ));
  }
  if identifier.is_empty() {
    return Err(AppError::new(
      "validation_error",
      "Identificador é obrigatório.",
    ));
fn ensure_client_exists(conn: &Connection, client_id: &str) -> AppResult<()> {
  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM CLIENTS WHERE id = ?1",
      params![client_id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("not_found", "Cliente não encontrado."));
  }
  Ok(())
}

fn normalize_attendance_channel(channel: &str) -> String {
  channel.trim().to_uppercase()
}

fn validate_attendance_payload(
  occurred_at: &str,
  channel: &str,
  subject: &str,
  notes: &str,
) -> AppResult<()> {
  if occurred_at.trim().is_empty() {
    return Err(AppError::new(
      "validation_error",
      "Data/hora é obrigatória.",
    ));
  }
  let normalized_channel = normalize_attendance_channel(channel);
  let allowed = [
    "PRESENCIAL",
    "WHATSAPP",
    "TELEFONE",
    "EMAIL",
    "VIDEO",
  ];
  if !allowed.contains(&normalized_channel.as_str()) {
    return Err(AppError::new(
      "validation_error",
      "Canal de atendimento inválido.",
    ));
  }
  if subject.trim().is_empty() {
    return Err(AppError::new("validation_error", "Assunto é obrigatório."));
  }
  if notes.trim().is_empty() {
    return Err(AppError::new("validation_error", "Notas são obrigatórias."));
  }
  Ok(())
}

#[tauri::command]
fn clients_list(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  filters: ClientsListFilters,
) -> AppResult<Vec<ClientSummary>> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let mut sql = String::from(
    "SELECT id, type, name, cpf_cnpj, status, created_at, updated_at FROM CLIENTS WHERE 1=1",
  );
  let mut params: Vec<String> = Vec::new();

  if let Some(q) = filters.q {
    let trimmed = q.trim();
    if !trimmed.is_empty() {
      let name_needle = format!("%{}%", trimmed);
      let digits = only_digits(trimmed);
      let cpf_needle = format!("%{}%", if digits.is_empty() { trimmed } else { digits.as_str() });
      sql.push_str(" AND (name LIKE ? OR cpf_cnpj LIKE ?)");
      params.push(name_needle);
      params.push(cpf_needle);
    }
  }

  if let Some(client_type) = filters.client_type {
    let normalized = normalize_client_type(&client_type);
    if !normalized.is_empty() {
      sql.push_str(" AND type = ?");
      params.push(normalized);
    }
  }

  if let Some(status) = filters.status {
    let normalized = status.trim().to_uppercase();
    if !normalized.is_empty() {
      sql.push_str(" AND status = ?");
      params.push(normalized);
    }
  }

  sql.push_str(" ORDER BY name ASC");

  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt.query_map(params_from_iter(params.iter()), |row| {
    Ok(ClientSummary {
      id: row.get(0)?,
      client_type: row.get(1)?,
      name: row.get(2)?,
      cpf_cnpj: row.get(3)?,
      status: row.get(4)?,
      created_at: row.get(5)?,
      updated_at: row.get(6)?,
    })
  })?;

  let mut clients = Vec::new();
  for row in rows {
    clients.push(row?);
  }
  Ok(clients)
}

#[tauri::command]
fn clients_get(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
) -> AppResult<ClientDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, type, name, cpf_cnpj, email, phone, notes, status, created_at, updated_at
     FROM CLIENTS WHERE id = ?1",
  )?;
  let client = stmt.query_row(params![id], |row| {
    Ok(ClientDetail {
      id: row.get(0)?,
      client_type: row.get(1)?,
      name: row.get(2)?,
      cpf_cnpj: row.get(3)?,
      email: row.get(4)?,
      phone: row.get(5)?,
      notes: row.get(6)?,
      status: row.get(7)?,
      created_at: row.get(8)?,
      updated_at: row.get(9)?,
    })
  });

  match client {
    Ok(client) => Ok(client),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::new("not_found", "Cliente não encontrado."))
    }
    Err(err) => Err(err.into()),
  }
}

#[tauri::command]
fn clients_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: CreateClientPayload,
) -> AppResult<ClientDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let client_type = normalize_client_type(&payload.client_type);
  let name = payload.name.trim().to_string();
  let cpf_cnpj = only_digits(&payload.cpf_cnpj);
  validate_client_payload(&client_type, &name, &cpf_cnpj)?;
  let email = normalize_optional_field(payload.email);
  let phone = normalize_optional_field(payload.phone);
  let notes = normalize_optional_field(payload.notes);

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM CLIENTS WHERE cpf_cnpj = ?1",
      params![cpf_cnpj],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    return Err(AppError::new(
      "cpf_cnpj_in_use",
      "CPF/CNPJ já cadastrado.",
    ));
  }

  let client_id = Uuid::new_v4().to_string();
  let now = now_iso();
  let status = "ACTIVE".to_string();

  conn.execute(
    "INSERT INTO CLIENTS (id, type, name, cpf_cnpj, email, phone, notes, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    params![
      client_id,
      client_type,
      name,
      cpf_cnpj,
      email,
      phone,
      notes,
      status,
      now,
      now
    ],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "create_client",
    Some("CLIENT"),
    Some(&client_id),
    Some("Cliente criado"),
    None,
  )?;

  Ok(ClientDetail {
    id: client_id,
    client_type,
    name,
    cpf_cnpj,
    email,
    phone,
    notes,
    status,
    created_at: now.clone(),
    updated_at: now,
  })
}

#[tauri::command]
fn clients_update(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
  payload: UpdateClientPayload,
) -> AppResult<ClientDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let existing: Option<(String, String)> = conn
    .query_row(
      "SELECT status, created_at FROM CLIENTS WHERE id = ?1",
      params![id.clone()],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  let (status, created_at) = match existing {
    Some(values) => values,
    None => return Err(AppError::new("not_found", "Cliente não encontrado.")),
  };

  let client_type = normalize_client_type(&payload.client_type);
  let name = payload.name.trim().to_string();
  let cpf_cnpj = only_digits(&payload.cpf_cnpj);
  validate_client_payload(&client_type, &name, &cpf_cnpj)?;
  let email = normalize_optional_field(payload.email);
  let phone = normalize_optional_field(payload.phone);
  let notes = normalize_optional_field(payload.notes);

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM CLIENTS WHERE cpf_cnpj = ?1 AND id != ?2",
      params![cpf_cnpj, id.clone()],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    return Err(AppError::new(
      "cpf_cnpj_in_use",
      "CPF/CNPJ já cadastrado.",
    ));
  }

  let now = now_iso();
  conn.execute(
    "UPDATE CLIENTS SET type = ?1, name = ?2, cpf_cnpj = ?3, email = ?4, phone = ?5, notes = ?6, updated_at = ?7
     WHERE id = ?8",
    params![
      client_type,
      name,
      cpf_cnpj,
      email,
      phone,
      notes,
      now,
      id.clone()
    ],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "update_client",
    Some("CLIENT"),
    Some(&id),
    Some("Cliente atualizado"),
    None,
  )?;

  Ok(ClientDetail {
    id,
    client_type,
    name,
    cpf_cnpj,
    email,
    phone,
    notes,
    status,
    created_at,
    updated_at: now,
  })
}

#[tauri::command]
fn clients_archive(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let exists: Option<String> = conn
    .query_row("SELECT id FROM CLIENTS WHERE id = ?1", params![id.clone()], |row| {
      row.get(0)
    })
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("not_found", "Cliente não encontrado."));
  }

  let now = now_iso();
  conn.execute(
    "UPDATE CLIENTS SET status = 'ARCHIVED', updated_at = ?1 WHERE id = ?2",
    params![now, id.clone()],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "archive_client",
    Some("CLIENT"),
    Some(&id),
    Some("Cliente arquivado"),
    None,
  )?;

  Ok(())
}

#[tauri::command]
fn cases_list(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  client_id: String,
) -> AppResult<Vec<CaseSummary>> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM CLIENTS WHERE id = ?1",
      params![client_id.clone()],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("not_found", "Cliente não encontrado."));
  }

  let mut stmt = conn.prepare(
    "SELECT id, client_id, identifier_type, identifier, court_city, court_unit, panel, rapporteur,
            distributed_at, closed_at, area, phase, value_amount, documents_path, created_at, updated_at
     FROM CASES
     WHERE client_id = ?1
     ORDER BY created_at DESC",
  )?;
  let rows = stmt.query_map(params![client_id], |row| {
    Ok(CaseSummary {
      id: row.get(0)?,
      client_id: row.get(1)?,
      identifier_type: row.get(2)?,
      identifier: row.get(3)?,
      court_city: row.get(4)?,
      court_unit: row.get(5)?,
      panel: row.get(6)?,
      rapporteur: row.get(7)?,
      distributed_at: row.get(8)?,
      closed_at: row.get(9)?,
      area: row.get(10)?,
      phase: row.get(11)?,
      value_amount: row.get(12)?,
      documents_path: row.get(13)?,
      created_at: row.get(14)?,
      updated_at: row.get(15)?,
    })
  })?;

  let mut cases = Vec::new();
  for row in rows {
    cases.push(row?);
  }
  Ok(cases)
}

#[tauri::command]
fn cases_get(
fn normalize_document_type(value: &str) -> String {
  value.trim().to_uppercase()
}

fn normalize_required_field(value: &str, label: &str) -> AppResult<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Err(AppError::new("validation_error", format!("{} é obrigatório.", label)));
  }
  Ok(trimmed.to_string())
}

#[tauri::command]
fn appointments_list(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
) -> AppResult<Vec<AppointmentSummary>> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_active_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, client_name, client_document, client_email, client_phone, title, attendance_date, created_at, updated_at
     FROM APPOINTMENTS
     ORDER BY attendance_date DESC, created_at DESC",
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(AppointmentSummary {
      id: row.get(0)?,
      client_name: row.get(1)?,
      client_document: row.get(2)?,
      client_email: row.get(3)?,
      client_phone: row.get(4)?,
      title: row.get(5)?,
      attendance_date: row.get(6)?,
      created_at: row.get(7)?,
      updated_at: row.get(8)?,
    })
  })?;

  let mut appointments = Vec::new();
  for row in rows {
    appointments.push(row?);
  }
  Ok(appointments)
}

#[tauri::command]
fn appointments_get(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
) -> AppResult<CaseDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, client_id, identifier_type, identifier, court_city, court_unit, panel, rapporteur,
            distributed_at, closed_at, area, phase, value_amount, documents_path, created_at, updated_at
     FROM CASES WHERE id = ?1",
  )?;
  let case_detail = stmt.query_row(params![id], |row| {
    Ok(CaseDetail {
      id: row.get(0)?,
      client_id: row.get(1)?,
      identifier_type: row.get(2)?,
      identifier: row.get(3)?,
      court_city: row.get(4)?,
      court_unit: row.get(5)?,
      panel: row.get(6)?,
      rapporteur: row.get(7)?,
      distributed_at: row.get(8)?,
      closed_at: row.get(9)?,
      area: row.get(10)?,
      phase: row.get(11)?,
      value_amount: row.get(12)?,
      documents_path: row.get(13)?,
      created_at: row.get(14)?,
      updated_at: row.get(15)?,
    })
  });

  match case_detail {
    Ok(case_detail) => Ok(case_detail),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::new("not_found", "Processo não encontrado."))
) -> AppResult<AppointmentDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_active_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, client_name, client_document, client_email, client_phone, title, attendance_date, history, analysis, conclusion, created_at, updated_at
     FROM APPOINTMENTS WHERE id = ?1",
  )?;
  let appointment = stmt.query_row(params![id], |row| {
    Ok(AppointmentDetail {
      id: row.get(0)?,
      client_name: row.get(1)?,
      client_document: row.get(2)?,
      client_email: row.get(3)?,
      client_phone: row.get(4)?,
      title: row.get(5)?,
      attendance_date: row.get(6)?,
      history: row.get(7)?,
      analysis: row.get(8)?,
      conclusion: row.get(9)?,
      created_at: row.get(10)?,
      updated_at: row.get(11)?,
    })
  });

  match appointment {
    Ok(appointment) => Ok(appointment),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::new("not_found", "Atendimento não encontrado."))
    }
    Err(err) => Err(err.into()),
  }
}

#[tauri::command]
fn cases_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: CreateCasePayload,
) -> AppResult<CaseDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let client_id = payload.client_id.trim().to_string();
  if client_id.is_empty() {
    return Err(AppError::new("validation_error", "Cliente é obrigatório."));
  }
  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM CLIENTS WHERE id = ?1",
      params![client_id.clone()],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("not_found", "Cliente não encontrado."));
  }

  let identifier_type = normalize_identifier_type(&payload.identifier_type);
  let identifier = payload.identifier.trim().to_string();
  validate_case_payload(&identifier_type, &identifier)?;

  let court_city = normalize_optional_field(payload.court_city);
  let court_unit = normalize_optional_field(payload.court_unit);
  let panel = normalize_optional_field(payload.panel);
  let rapporteur = normalize_optional_field(payload.rapporteur);
  let distributed_at = normalize_optional_field(payload.distributed_at);
  let closed_at = normalize_optional_field(payload.closed_at);
  let area = normalize_optional_field(payload.area);
  let phase = normalize_optional_field(payload.phase);
  let documents_path = normalize_optional_field(payload.documents_path);

  let case_id = Uuid::new_v4().to_string();
  let now = now_iso();

  conn.execute(
    "INSERT INTO CASES (id, client_id, identifier_type, identifier, court_city, court_unit, panel,
                        rapporteur, distributed_at, closed_at, area, phase, value_amount,
                        documents_path, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
    params![
      case_id,
      client_id,
      identifier_type,
      identifier,
      court_city,
      court_unit,
      panel,
      rapporteur,
      distributed_at,
      closed_at,
      area,
      phase,
      payload.value_amount,
      documents_path,
fn appointments_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: CreateAppointmentPayload,
) -> AppResult<AppointmentDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let session = require_active_session(&conn, &session_id)?;

  let client_name = normalize_required_field(&payload.client_name, "Nome do cliente")?;
  let raw_document = normalize_required_field(&payload.client_document, "CPF/CNPJ")?;
  let client_document = only_digits(&raw_document);
  if client_document.len() == 11 {
    if !is_valid_cpf(&client_document) {
      return Err(AppError::new("validation_error", "CPF inválido."));
    }
  } else if client_document.len() == 14 {
    if !is_valid_cnpj(&client_document) {
      return Err(AppError::new("validation_error", "CNPJ inválido."));
    }
  } else {
    return Err(AppError::new("validation_error", "CPF/CNPJ inválido."));
  }

  let title = normalize_required_field(&payload.title, "Assunto")?;
  let attendance_date = normalize_required_field(&payload.attendance_date, "Data do atendimento")?;
  let history = normalize_required_field(&payload.history, "Histórico")?;
  let analysis = normalize_required_field(&payload.analysis, "Análise")?;
  let conclusion = normalize_required_field(&payload.conclusion, "Conclusão")?;
  let client_email = normalize_optional_field(payload.client_email);
  let client_phone = normalize_optional_field(payload.client_phone);

  let appointment_id = Uuid::new_v4().to_string();
  let now = now_iso();

  conn.execute(
    "INSERT INTO APPOINTMENTS (id, client_name, client_document, client_email, client_phone, title, attendance_date, history, analysis, conclusion, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    params![
      appointment_id,
      client_name,
      client_document,
      client_email,
      client_phone,
      title,
      attendance_date,
      history,
      analysis,
      conclusion,
#[tauri::command]
fn attendances_list(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  client_id: String,
) -> AppResult<Vec<AttendanceSummary>> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  require_admin_session(&conn, &session_id)?;
  ensure_client_exists(&conn, &client_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, client_id, occurred_at, channel, subject, notes, created_at, updated_at
     FROM ATTENDANCES WHERE client_id = ?1 ORDER BY occurred_at DESC",
  )?;
  let rows = stmt.query_map(params![client_id], |row| {
    Ok(AttendanceSummary {
      id: row.get(0)?,
      client_id: row.get(1)?,
      occurred_at: row.get(2)?,
      channel: row.get(3)?,
      subject: row.get(4)?,
      notes: row.get(5)?,
      created_at: row.get(6)?,
      updated_at: row.get(7)?,
    })
  })?;

  let mut attendances = Vec::new();
  for row in rows {
    attendances.push(row?);
  }
  Ok(attendances)
}

#[tauri::command]
fn attendances_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  client_id: String,
  payload: CreateAttendancePayload,
) -> AppResult<AttendanceDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;
  ensure_client_exists(&conn, &client_id)?;

  let occurred_at = payload.occurred_at.trim().to_string();
  let channel = normalize_attendance_channel(&payload.channel);
  let subject = payload.subject.trim().to_string();
  let notes = payload.notes.trim().to_string();
  validate_attendance_payload(&occurred_at, &channel, &subject, &notes)?;

  let attendance_id = Uuid::new_v4().to_string();
  let now = now_iso();

  conn.execute(
    "INSERT INTO ATTENDANCES (id, client_id, occurred_at, channel, subject, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    params![
      attendance_id,
      client_id,
      occurred_at,
      channel,
      subject,
      notes,
      now,
      now
    ],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "create_case",
    Some("CASE"),
    Some(&case_id),
    Some("Processo criado"),
    None,
  )?;

  Ok(CaseDetail {
    id: case_id,
    client_id,
    identifier_type,
    identifier,
    court_city,
    court_unit,
    panel,
    rapporteur,
    distributed_at,
    closed_at,
    area,
    phase,
    value_amount: payload.value_amount,
    documents_path,
    &session.user_id,
    "create_appointment",
    Some("APPOINTMENT"),
    Some(&appointment_id),
    &admin.id,
    "create_attendance",
    Some("ATTENDANCE"),
    Some(&attendance_id),
    Some("Atendimento criado"),
    None,
  )?;

  Ok(AppointmentDetail {
    id: appointment_id,
    client_name,
    client_document,
    client_email,
    client_phone,
    title,
    attendance_date,
    history,
    analysis,
    conclusion,
  Ok(AttendanceDetail {
    id: attendance_id,
    client_id,
    occurred_at,
    channel,
    subject,
    notes,
    created_at: now.clone(),
    updated_at: now,
  })
}

#[tauri::command]
fn cases_update(
fn documents_generate_html(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: DocumentGeneratePayload,
) -> AppResult<DocumentHtmlResponse> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let session = require_active_session(&conn, &session_id)?;

  let document_type = normalize_document_type(&payload.document_type);
  if document_type != "RELATORIO" && document_type != "PARECER" {
    return Err(AppError::new("validation_error", "Tipo de documento inválido."));
  }
  let validated_payload = DocumentGeneratePayload {
    document_type,
    office_name: normalize_required_field(&payload.office_name, "Nome do escritório")?,
    generated_at: normalize_required_field(&payload.generated_at, "Data")?,
    client_name: normalize_required_field(&payload.client_name, "Nome do cliente")?,
    client_document: normalize_required_field(&payload.client_document, "CPF/CNPJ")?,
    client_email: normalize_optional_field(payload.client_email),
    client_phone: normalize_optional_field(payload.client_phone),
    title: normalize_required_field(&payload.title, "Assunto")?,
    attendance_date: normalize_required_field(&payload.attendance_date, "Data do atendimento")?,
    history: normalize_required_field(&payload.history, "Histórico")?,
    analysis: normalize_required_field(&payload.analysis, "Análise")?,
    conclusion: normalize_required_field(&payload.conclusion, "Conclusão")?,
    appointment_id: payload.appointment_id,
  };

  let html = build_document_html(&validated_payload);
  let metadata = serde_json::json!({
    "documentType": validated_payload.document_type,
    "appointmentId": validated_payload.appointment_id
  });

  insert_audit_log(
    &conn,
    &session.user_id,
    "document_generate",
    Some("DOCUMENT"),
    validated_payload.appointment_id.as_deref(),
    Some("Documento gerado"),
    Some(&metadata.to_string()),
  )?;

  Ok(DocumentHtmlResponse { html })
}

#[tauri::command]
fn documents_export_html(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: DocumentExportHtmlPayload,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let session = require_active_session(&conn, &session_id)?;

  let file_path = normalize_required_field(&payload.file_path, "Caminho do arquivo")?;
  fs::write(&file_path, payload.html)?;

  let metadata = serde_json::json!({
    "documentType": normalize_document_type(&payload.document_type),
    "appointmentId": payload.appointment_id,
    "format": "HTML",
    "filePath": file_path
  });

  insert_audit_log(
    &conn,
    &session.user_id,
    "document_export",
    Some("DOCUMENT"),
    payload.appointment_id.as_deref(),
    Some("Documento exportado"),
    Some(&metadata.to_string()),
  )?;

  Ok(())
}

#[tauri::command]
fn documents_log_export(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: DocumentLogExportPayload,
fn attendances_update(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
  payload: UpdateCasePayload,
) -> AppResult<CaseDetail> {
  payload: UpdateAttendancePayload,
) -> AppResult<AttendanceDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let admin = require_admin_session(&conn, &session_id)?;

  let existing: Option<(String, String)> = conn
    .query_row(
      "SELECT client_id, created_at FROM CASES WHERE id = ?1",
      "SELECT client_id, created_at FROM ATTENDANCES WHERE id = ?1",
      params![id.clone()],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  let (client_id, created_at) = match existing {
    Some(values) => values,
    None => return Err(AppError::new("not_found", "Processo não encontrado.")),
  };

  let identifier_type = normalize_identifier_type(&payload.identifier_type);
  let identifier = payload.identifier.trim().to_string();
  validate_case_payload(&identifier_type, &identifier)?;

  let court_city = normalize_optional_field(payload.court_city);
  let court_unit = normalize_optional_field(payload.court_unit);
  let panel = normalize_optional_field(payload.panel);
  let rapporteur = normalize_optional_field(payload.rapporteur);
  let distributed_at = normalize_optional_field(payload.distributed_at);
  let closed_at = normalize_optional_field(payload.closed_at);
  let area = normalize_optional_field(payload.area);
  let phase = normalize_optional_field(payload.phase);
  let documents_path = normalize_optional_field(payload.documents_path);

  let now = now_iso();
  conn.execute(
    "UPDATE CASES
     SET identifier_type = ?1,
         identifier = ?2,
         court_city = ?3,
         court_unit = ?4,
         panel = ?5,
         rapporteur = ?6,
         distributed_at = ?7,
         closed_at = ?8,
         area = ?9,
         phase = ?10,
         value_amount = ?11,
         documents_path = ?12,
         updated_at = ?13
     WHERE id = ?14",
    params![
      identifier_type,
      identifier,
      court_city,
      court_unit,
      panel,
      rapporteur,
      distributed_at,
      closed_at,
      area,
      phase,
      payload.value_amount,
      documents_path,
      now,
      id.clone()
    ],
    None => return Err(AppError::new("not_found", "Atendimento não encontrado.")),
  };

  let occurred_at = payload.occurred_at.trim().to_string();
  let channel = normalize_attendance_channel(&payload.channel);
  let subject = payload.subject.trim().to_string();
  let notes = payload.notes.trim().to_string();
  validate_attendance_payload(&occurred_at, &channel, &subject, &notes)?;

  let now = now_iso();
  conn.execute(
    "UPDATE ATTENDANCES SET occurred_at = ?1, channel = ?2, subject = ?3, notes = ?4, updated_at = ?5
     WHERE id = ?6",
    params![occurred_at, channel, subject, notes, now, id.clone()],
  )?;

  insert_audit_log(
    &conn,
    &admin.id,
    "update_case",
    Some("CASE"),
    Some(&id),
    Some("Processo atualizado"),
    None,
  )?;

  Ok(CaseDetail {
    id,
    client_id,
    identifier_type,
    identifier,
    court_city,
    court_unit,
    panel,
    rapporteur,
    distributed_at,
    closed_at,
    area,
    phase,
    value_amount: payload.value_amount,
    documents_path,
    "update_attendance",
    Some("ATTENDANCE"),
    Some(&id),
    Some("Atendimento atualizado"),
    None,
  )?;

  Ok(AttendanceDetail {
    id,
    client_id,
    occurred_at,
    channel,
    subject,
    notes,
    created_at,
    updated_at: now,
  })
}

#[tauri::command]
fn attendances_delete(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  id: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let session = require_active_session(&conn, &session_id)?;

  let metadata = serde_json::json!({
    "documentType": normalize_document_type(&payload.document_type),
    "appointmentId": payload.appointment_id,
    "format": payload.format.trim().to_uppercase()
  });

  insert_audit_log(
    &conn,
    &session.user_id,
    "document_export",
    Some("DOCUMENT"),
    payload.appointment_id.as_deref(),
    Some("Documento exportado"),
    Some(&metadata.to_string()),
  let admin = require_admin_session(&conn, &session_id)?;

  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM ATTENDANCES WHERE id = ?1",
      params![id.clone()],
      |row| row.get(0),
    )
    .optional()?;
  if existing.is_none() {
    return Err(AppError::new("not_found", "Atendimento não encontrado."));
  }

  conn.execute("DELETE FROM ATTENDANCES WHERE id = ?1", params![id.clone()])?;

  insert_audit_log(
    &conn,
    &admin.id,
    "delete_attendance",
    Some("ATTENDANCE"),
    Some(&id),
    Some("Atendimento removido"),
    None,
  )?;

  Ok(())
}

fn main() {
  tauri::Builder::default()
    .manage(AppState::default())
    .setup(|app| {
      let state: State<'_, AppState> = app.state();
      let handle = app.handle();
      let path = db_path(&handle, &state)?;
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
      users_reset_password,
      teams_list,
      teams_create,
      teams_update,
      teams_set_members,
      teams_delete_or_archive,
      clients_list,
      clients_get,
      clients_create,
      clients_update,
      clients_archive,
      cases_list,
      cases_get,
      cases_create,
      cases_update
      appointments_list,
      appointments_get,
      appointments_create,
      documents_generate_html,
      documents_export_html,
      documents_log_export
      attendances_list,
      attendances_create,
      attendances_update,
      attendances_delete
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
