#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use hex;
use rand_core::OsRng;
use rusqlite::{params, params_from_iter, Connection, ErrorCode, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
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
  oab_number: Option<String>,
  oab_uf: Option<String>,
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
  oab_number: Option<String>,
  oab_uf: Option<String>,
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
  oab_number: Option<String>,
  oab_uf: Option<String>,
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

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum ClientType {
  Pf,
  Pj,
}

impl ClientType {
  fn as_str(&self) -> &'static str {
    match self {
      ClientType::Pf => "PF",
      ClientType::Pj => "PJ",
    }
  }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum ClientStatus {
  Active,
  Archived,
}

impl ClientStatus {
  fn as_str(&self) -> &'static str {
    match self {
      ClientStatus::Active => "ACTIVE",
      ClientStatus::Archived => "ARCHIVED",
    }
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientSummary {
  id: String,
  r#type: ClientType,
  name: String,
  cpf_cnpj: String,
  status: ClientStatus,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientDetail {
  id: String,
  r#type: ClientType,
  name: String,
  cpf_cnpj: String,
  status: ClientStatus,
  email: Option<String>,
  phone: Option<String>,
  notes: Option<String>,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientsListFilters {
  q: Option<String>,
  #[serde(rename = "type")]
  r#type: Option<ClientType>,
  status: Option<ClientStatus>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientPayload {
  r#type: ClientType,
  name: String,
  cpf_cnpj: String,
  email: Option<String>,
  phone: Option<String>,
  notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum AttendanceChannel {
  Presencial,
  Whatsapp,
  Telefone,
  Email,
  Video,
}

impl AttendanceChannel {
  fn as_str(&self) -> &'static str {
    match self {
      AttendanceChannel::Presencial => "PRESENCIAL",
      AttendanceChannel::Whatsapp => "WHATSAPP",
      AttendanceChannel::Telefone => "TELEFONE",
      AttendanceChannel::Email => "EMAIL",
      AttendanceChannel::Video => "VIDEO",
    }
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttendanceSummary {
  id: String,
  client_id: String,
  occurred_at: String,
  channel: AttendanceChannel,
  subject: String,
  notes: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttendanceDetail {
  id: String,
  client_id: String,
  occurred_at: String,
  channel: AttendanceChannel,
  subject: String,
  notes: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttendancePayload {
  occurred_at: String,
  channel: AttendanceChannel,
  subject: String,
  notes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentHtmlResponse {
  html: String,
  document_id: String,
  document_hash: String,
  content_hash: String,
  created_at: String,
  authored_by_name: String,
  authored_by_oab: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum DocumentType {
  Relatorio,
  Parecer,
}

impl DocumentType {
  fn as_str(&self) -> &'static str {
    match self {
      DocumentType::Relatorio => "RELATORIO",
      DocumentType::Parecer => "PARECER",
    }
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentGeneratePayload {
  document_type: DocumentType,
  office_name: String,
  generated_at: String,
  client_id: String,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentExportHtmlPayload {
  file_path: String,
  document_id: String,
  document_type: Option<DocumentType>,
  appointment_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentLogExportPayload {
  document_id: String,
  document_type: Option<DocumentType>,
  appointment_id: Option<String>,
  format: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentExportHtmlResponse {
  file_path: String,
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
  oab_number: Option<String>,
  oab_uf: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUserPayload {
  name: String,
  email: String,
  role: String,
  oab_number: Option<String>,
  oab_uf: Option<String>,
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

fn normalize_html_for_hash(html: &str) -> String {
  html.replace("\r\n", "\n").replace('\r', "\n").trim_end().to_string()
}

fn normalize_optional_field(value: Option<String>) -> Option<String> {
  value.and_then(|input| {
    let trimmed = input.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed.to_string())
    }
  })
}

const DEFAULT_SIGNATURE_NAME: &str = "Jorge Nicolas Paiva de Sousa";
const DEFAULT_SIGNATURE_OAB: &str = "OAB/SP 490052";

fn html_escape(input: &str) -> String {
  let mut escaped = String::with_capacity(input.len());
  for ch in input.chars() {
    match ch {
      '&' => escaped.push_str("&amp;"),
      '<' => escaped.push_str("&lt;"),
      '>' => escaped.push_str("&gt;"),
      '"' => escaped.push_str("&quot;"),
      '\'' => escaped.push_str("&#39;"),
      _ => escaped.push(ch),
    }
  }
  escaped
}

fn sha256_hex(data: &[u8]) -> String {
  let mut hasher = Sha256::new();
  hasher.update(data);
  hex::encode(hasher.finalize())
}

fn build_section_paragraphs(content: &str) -> String {
  let escaped = html_escape(content);
  let mut paragraphs = Vec::new();
  let mut current = String::new();
  for line in escaped.lines() {
    if line.trim().is_empty() {
      if !current.trim().is_empty() {
        paragraphs.push(current.trim_end().to_string());
        current.clear();
      }
    } else {
      if !current.is_empty() {
        current.push_str("<br />");
      }
      current.push_str(line);
    }
  }
  if !current.trim().is_empty() {
    paragraphs.push(current.trim_end().to_string());
  }
  if paragraphs.is_empty() {
    return "<p></p>".to_string();
  }
  paragraphs
    .into_iter()
    .map(|paragraph| format!("<p>{}</p>", paragraph))
    .collect::<Vec<_>>()
    .join("\n")
}

fn resolve_signature_identity(
  user_name: String,
  oab_number: Option<String>,
  oab_uf: Option<String>,
) -> (String, String) {
  let resolved_name = if user_name.trim().is_empty() {
    DEFAULT_SIGNATURE_NAME.to_string()
  } else {
    user_name
  };
  let oab_number = normalize_optional_field(oab_number);
  let oab_uf = normalize_optional_field(oab_uf);
  let resolved_oab = match (oab_number, oab_uf) {
    (Some(number), Some(uf)) => format!("OAB/{} {}", uf, number),
    _ => DEFAULT_SIGNATURE_OAB.to_string(),
  };
  (resolved_name, resolved_oab)
}

fn build_abnt_html(payload: &DocumentGeneratePayload) -> String {
  let title = html_escape(&payload.title);
  let office_name = html_escape(&payload.office_name);
  let client_name = html_escape(&payload.client_name);
  let client_document = html_escape(&payload.client_document);
  let generated_at = html_escape(&payload.generated_at);
  let attendance_date = html_escape(&payload.attendance_date);
  let client_email = payload
    .client_email
    .as_deref()
    .map(html_escape)
    .unwrap_or_default();
  let client_phone = payload
    .client_phone
    .as_deref()
    .map(html_escape)
    .unwrap_or_default();
  let history = build_section_paragraphs(&payload.history);
  let analysis = build_section_paragraphs(&payload.analysis);
  let conclusion = build_section_paragraphs(&payload.conclusion);
  let client_contact = match (client_email.is_empty(), client_phone.is_empty()) {
    (true, true) => String::new(),
    (false, true) => format!("<p class=\"meta-line\">E-mail: {}</p>", client_email),
    (true, false) => format!("<p class=\"meta-line\">Telefone: {}</p>", client_phone),
    (false, false) => format!(
      "<p class=\"meta-line\">E-mail: {} · Telefone: {}</p>",
      client_email, client_phone
    ),
  };

  format!(
    "<!doctype html>
<html lang=\"pt-BR\">
<head>
  <meta charset=\"utf-8\" />
  <title>{}</title>
  <style>
    @page {{ size: A4; margin: 3cm 2cm 2cm 3cm; }}
    body {{ font-family: \"Times New Roman\", Times, serif; font-size: 12pt; line-height: 1.5; text-align: justify; }}
    p {{ text-indent: 1.25cm; margin: 0 0 12pt 0; }}
    h1 {{ text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 0 0 24pt 0; }}
    h2 {{ font-size: 12pt; font-weight: bold; text-transform: uppercase; margin: 24pt 0 12pt 0; }}
    .signature {{ margin-top: 48pt; text-align: center; }}
    .signature p {{ text-indent: 0; margin: 0; }}
    .hash {{ font-size: 9pt; margin-top: 18pt; word-break: break-word; text-align: left; }}
    .hash p {{ text-indent: 0; margin: 0 0 6pt 0; }}
    .meta {{ font-size: 10pt; margin-top: 12pt; text-align: left; }}
    .meta p {{ text-indent: 0; margin: 0 0 6pt 0; }}
    hr {{ border: 0; border-top: 1px solid #000; margin: 24pt 0; }}
  </style>
</head>
<body>
  <h1>{}</h1>
  <div class=\"meta\">
    <p class=\"meta-line\">Escritório: {}</p>
    <p class=\"meta-line\">Cliente: {} ({})</p>
    {}
    <p class=\"meta-line\">Data do atendimento: {}</p>
    <p class=\"meta-line\">Documento gerado em: {}</p>
  </div>
  <h2>1 HISTÓRICO DOS FATOS</h2>
  {}
  <h2>2 ANÁLISE JURÍDICA</h2>
  {}
  <h2>3 CONCLUSÃO</h2>
  {}
</body>
</html>",
    title,
    title,
    office_name,
    client_name,
    client_document,
    client_contact,
    attendance_date,
    generated_at,
    history,
    analysis,
    conclusion
  )
}

fn build_signature_block(
  authored_by_user_name: &str,
  authored_by_oab: &str,
  office_name: &str,
  created_at: &str,
  document_hash: Option<&str>,
) -> String {
  let hash_block = document_hash.map(|hash| {
    format!(
      "<div class=\"hash\">
  <p>Hash SHA-256 do conteúdo final:</p>
  <p>{}</p>
</div>",
      html_escape(hash)
    )
  });
  let resolved_name = html_escape(authored_by_user_name);
  let resolved_oab = html_escape(authored_by_oab);
  let resolved_office = html_escape(office_name);
  let resolved_date = html_escape(created_at);
  format!(
    "<section class=\"signature\">
  <hr />
  <p>{}</p>
  <p>{}</p>
</section>
<div class=\"meta\">
  <p>Assinado digitalmente por: {} ({})</p>
  <p>Escritório: {}</p>
  <p>Data: {}</p>
</div>
{}",
    resolved_name,
    resolved_oab,
    resolved_name,
    resolved_oab,
    resolved_office,
    resolved_date,
    hash_block.unwrap_or_default()
  )
}

fn inject_signature_block(html: &str, signature_block: &str) -> String {
  if let Some(index) = html.rfind("</body>") {
    let mut signed = String::with_capacity(html.len() + signature_block.len());
    signed.push_str(&html[..index]);
    signed.push_str(signature_block);
    signed.push_str(&html[index..]);
    signed
  } else {
    format!("{}\n{}", html, signature_block)
  }
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
      "0003_clients_attendances",
      "\
      CREATE TABLE IF NOT EXISTS CLIENTS(
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        cpf_cnpj TEXT NOT NULL,
        status TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ATTENDANCES(
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        channel TEXT NOT NULL,
        subject TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(client_id) REFERENCES CLIENTS(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_attendances_client_id ON ATTENDANCES(client_id);
      ",
    ),
    (
      "0004_attendances_indexes",
      "\
      CREATE INDEX IF NOT EXISTS idx_attendances_client_id_occurred_at
      ON ATTENDANCES(client_id, occurred_at);
      ",
    ),
    (
      "0005_document_signatures",
      "\
      CREATE TABLE IF NOT EXISTS DOCUMENT_SIGNATURES(
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        client_id TEXT NOT NULL,
        office_name TEXT NOT NULL,
        authored_by_user_id TEXT NOT NULL,
        authored_by_user_name TEXT NOT NULL,
        authored_by_oab TEXT,
        created_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        document_hash TEXT NOT NULL,
        signature_block TEXT NOT NULL,
        signed_html TEXT NOT NULL,
        exported_path TEXT,
        exported_at TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
      );
      CREATE INDEX IF NOT EXISTS idx_docsign_client ON DOCUMENT_SIGNATURES(client_id);
      CREATE INDEX IF NOT EXISTS idx_docsign_hash ON DOCUMENT_SIGNATURES(document_hash);
      CREATE INDEX IF NOT EXISTS idx_docsign_docid ON DOCUMENT_SIGNATURES(document_id);
      ",
    ),
    (
      "0006_user_oab_fields",
      "\
      ALTER TABLE USERS ADD COLUMN oab_number TEXT;
      ALTER TABLE USERS ADD COLUMN oab_uf TEXT;
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

fn fetch_user_signature_info(
  conn: &Connection,
  user_id: &str,
) -> AppResult<(String, Option<String>, Option<String>)> {
  let mut stmt = conn.prepare(
    "SELECT name, oab_number, oab_uf FROM USERS WHERE id = ?1",
  )?;
  let row = stmt.query_row(params![user_id], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, Option<String>>(2)?,
    ))
  });
  let (name, oab_number, oab_uf) = match row {
    Ok(row) => row,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::new("not_found", "Usuário não encontrado."))
    }
    Err(err) => return Err(err.into()),
  };
  Ok((name, oab_number, oab_uf))
}

fn require_admin_session(conn: &Connection, session_id: &str) -> AppResult<UserInfo> {
  let session = require_active_session(conn, session_id)?;
  let mut stmt = conn.prepare(
    "SELECT id, name, email, role, status, last_login_at, oab_number, oab_uf FROM USERS WHERE id = ?1",
  )?;
  let user = stmt.query_row(params![session.user_id], |row| {
    Ok(UserInfo {
      id: row.get(0)?,
      name: row.get(1)?,
      email: row.get(2)?,
      role: row.get(3)?,
      status: row.get(4)?,
      last_login_at: row.get(5)?,
      oab_number: row.get(6)?,
      oab_uf: row.get(7)?,
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

fn ensure_client_exists(conn: &Connection, client_id: &str) -> AppResult<()> {
  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM CLIENTS WHERE id = ?1",
      params![client_id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("client_not_found", "Cliente não encontrado."));
  }
  Ok(())
}

fn parse_client_type(value: &str) -> AppResult<ClientType> {
  match value {
    "PF" => Ok(ClientType::Pf),
    "PJ" => Ok(ClientType::Pj),
    _ => Err(AppError::new(
      "validation_failed",
      "Tipo de cliente inválido.",
    )),
  }
}

fn parse_client_status(value: &str) -> AppResult<ClientStatus> {
  match value {
    "ACTIVE" => Ok(ClientStatus::Active),
    "ARCHIVED" => Ok(ClientStatus::Archived),
    _ => Err(AppError::new(
      "validation_failed",
      "Status de cliente inválido.",
    )),
  }
}

fn parse_attendance_channel(value: &str) -> AppResult<AttendanceChannel> {
  match value {
    "PRESENCIAL" => Ok(AttendanceChannel::Presencial),
    "WHATSAPP" => Ok(AttendanceChannel::Whatsapp),
    "TELEFONE" => Ok(AttendanceChannel::Telefone),
    "EMAIL" => Ok(AttendanceChannel::Email),
    "VIDEO" => Ok(AttendanceChannel::Video),
    _ => Err(AppError::new(
      "validation_failed",
      "Canal inválido para atendimento.",
    )),
  }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
  value.and_then(|text| {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed)
    }
  })
}

fn validate_client_payload(payload: &ClientPayload) -> AppResult<(ClientType, String, String, Option<String>, Option<String>, Option<String>)> {
  let name = payload.name.trim().to_string();
  if name.is_empty() {
    return Err(AppError::new("validation_failed", "Nome é obrigatório."));
  }

  let cpf_cnpj = payload.cpf_cnpj.trim().to_string();
  if cpf_cnpj.is_empty() {
    return Err(AppError::new(
      "validation_failed",
      "CPF/CNPJ é obrigatório.",
    ));
  }

  Ok((
    payload.r#type,
    name,
    cpf_cnpj,
    normalize_optional_text(payload.email.clone()),
    normalize_optional_text(payload.phone.clone()),
    normalize_optional_text(payload.notes.clone()),
  ))
}

fn validate_attendance_payload(
  payload: &AttendancePayload,
) -> AppResult<(String, AttendanceChannel, String, String)> {
  let occurred_at = payload.occurred_at.trim().to_string();
  if occurred_at.is_empty() {
    return Err(AppError::new(
      "validation_failed",
      "occurredAt é obrigatório.",
    ));
  }
  if chrono::DateTime::parse_from_rfc3339(&occurred_at).is_err() {
    return Err(AppError::new(
      "validation_failed",
      "occurredAt deve estar no formato ISO.",
    ));
  }

  let subject = payload.subject.trim().to_string();
  if subject.is_empty() {
    return Err(AppError::new(
      "validation_failed",
      "Assunto é obrigatório.",
    ));
  }

  let notes = payload.notes.trim().to_string();
  if notes.is_empty() {
    return Err(AppError::new(
      "validation_failed",
      "Observações são obrigatórias.",
    ));
  }

  Ok((occurred_at, payload.channel, subject, notes))
}

fn handle_constraint_error(err: rusqlite::Error) -> AppError {
  if let rusqlite::Error::SqliteFailure(db_err, _) = &err {
    if db_err.code == ErrorCode::ConstraintViolation {
      return AppError::new("constraint_failed", "Operação violou uma restrição.");
    }
  }
  err.into()
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
      oab_number: None,
      oab_uf: None,
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
    "SELECT id, name, email, role, status, password_hash, oab_number, oab_uf FROM USERS WHERE email = ?1",
  )?;
  let result = stmt.query_row(params![email_lookup], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, Option<String>>(6)?,
      row.get::<_, Option<String>>(7)?,
    ))
  });

  let (id, name, email, role, status, password_hash, oab_number, oab_uf) = match result {
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
      oab_number,
      oab_uf,
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
    "SELECT id, name, email, role, status, created_at, updated_at, last_login_at, oab_number, oab_uf \
     FROM USERS WHERE 1=1",
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
      oab_number: row.get(8)?,
      oab_uf: row.get(9)?,
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
    "SELECT id, name, email, role, status, created_at, updated_at, last_login_at, oab_number, oab_uf \
     FROM USERS WHERE id = ?1",
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
      oab_number: row.get(8)?,
      oab_uf: row.get(9)?,
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
  let oab_number = normalize_optional_field(payload.oab_number);
  let oab_uf = normalize_optional_field(payload.oab_uf);
  let now = now_iso();
  let user_id = Uuid::new_v4().to_string();
  conn.execute(
    "INSERT INTO USERS (id, name, email, role, status, password_hash, password_salt, created_at, updated_at,
     oab_number, oab_uf)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    params![
      user_id,
      name,
      email,
      role,
      status,
      password_hash,
      password_salt,
      now,
      now,
      oab_number,
      oab_uf
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
    oab_number,
    oab_uf,
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
    "SELECT role, status, created_at, last_login_at, oab_number, oab_uf FROM USERS WHERE id = ?1",
  )?;
  let current = stmt.query_row(params![id.clone()], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, Option<String>>(3)?,
      row.get::<_, Option<String>>(4)?,
      row.get::<_, Option<String>>(5)?,
    ))
  });
  let (current_role, current_status, created_at, last_login_at, _current_oab_number, _current_oab_uf) =
    match current {
      Ok(row) => row,
      Err(rusqlite::Error::QueryReturnedNoRows) => {
        return Err(AppError::new("not_found", "Usuário não encontrado."))
      }
      Err(err) => return Err(err.into()),
    };

  let name = payload.name.trim().to_string();
  let email = payload.email.trim().to_lowercase();
  let role = payload.role.trim().to_uppercase();
  let oab_number = normalize_optional_field(payload.oab_number);
  let oab_uf = normalize_optional_field(payload.oab_uf);

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
    "UPDATE USERS SET name = ?1, email = ?2, role = ?3, updated_at = ?4, oab_number = ?5, oab_uf = ?6 \
     WHERE id = ?7",
    params![name, email, role, now, oab_number, oab_uf, id],
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
    oab_number,
    oab_uf,
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
    "SELECT name, email, role, status, created_at, updated_at, last_login_at, oab_number, oab_uf \
     FROM USERS WHERE id = ?1",
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
      row.get::<_, Option<String>>(7)?,
      row.get::<_, Option<String>>(8)?,
    ))
  });

  let (
    name,
    email,
    role,
    current_status,
    created_at,
    _updated_at,
    last_login_at,
    oab_number,
    oab_uf,
  ) = match current {
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
    oab_number,
    oab_uf,
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
  require_active_session(&conn, &session_id)?;

  let mut sql = String::from(
    "SELECT id, type, name, cpf_cnpj, status, created_at, updated_at FROM CLIENTS WHERE 1=1",
  );
  let mut params: Vec<String> = Vec::new();

  if let Some(q) = filters.q {
    let needle = format!("%{}%", q.trim());
    sql.push_str(" AND (name LIKE ? OR cpf_cnpj LIKE ?)");
    params.push(needle.clone());
    params.push(needle);
  }

  if let Some(client_type) = filters.r#type {
    sql.push_str(" AND type = ?");
    params.push(client_type.as_str().to_string());
  }

  if let Some(status) = filters.status {
    sql.push_str(" AND status = ?");
    params.push(status.as_str().to_string());
  }

  sql.push_str(" ORDER BY name ASC");

  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt.query_map(params_from_iter(params.iter()), |row| {
  let client_type: String = row.get(1)?;
  let status: String = row.get(4)?;

  let parsed_type = match parse_client_type(client_type.trim()) {
    Ok(v) => v,
    Err(_e) => return Err(rusqlite::Error::InvalidQuery),
  };

  let parsed_status = match parse_client_status(status.trim()) {
    Ok(v) => v,
    Err(_e) => return Err(rusqlite::Error::InvalidQuery),
  };

  Ok(ClientSummary {
    id: row.get(0)?,
    r#type: parsed_type,
    name: row.get(2)?,
    cpf_cnpj: row.get(3)?,
    status: parsed_status,
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
  require_active_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, type, name, cpf_cnpj, status, email, phone, notes, created_at, updated_at
     FROM CLIENTS WHERE id = ?1",
  )?;

  let client_result: rusqlite::Result<ClientDetail> = stmt.query_row(params![id], |row| {
    let client_type: String = row.get(1)?;
    let status: String = row.get(4)?;

    let parsed_type = match parse_client_type(client_type.trim()) {
      Ok(v) => v,
      Err(_e) => return Err(rusqlite::Error::InvalidQuery),
    };

    let parsed_status = match parse_client_status(status.trim()) {
      Ok(v) => v,
      Err(_e) => return Err(rusqlite::Error::InvalidQuery),
    };

    Ok(ClientDetail {
      id: row.get(0)?,
      r#type: parsed_type,
      name: row.get(2)?,
      cpf_cnpj: row.get(3)?,
      status: parsed_status,
      email: row.get(5)?,
      phone: row.get(6)?,
      notes: row.get(7)?,
      created_at: row.get(8)?,
      updated_at: row.get(9)?,
    })
  });

  match client_result {
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
  payload: ClientPayload,
) -> AppResult<ClientDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;

  let (client_type, name, cpf_cnpj, email, phone, notes) = validate_client_payload(&payload)?;
  let now = now_iso();
  let id = Uuid::new_v4().to_string();
  let status = ClientStatus::Active;

  if let Err(err) = conn.execute(
    "INSERT INTO CLIENTS (id, type, name, cpf_cnpj, status, email, phone, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    params![
      id,
      client_type.as_str(),
      name,
      cpf_cnpj,
      status.as_str(),
      email,
      phone,
      notes,
      now,
      now
    ],
  ) {
    return Err(handle_constraint_error(err));
  }

  insert_audit_log(
    &conn,
    &user.user_id,
    "create_client",
    Some("CLIENT"),
    Some(&id),
    Some("Cliente criado"),
    None,
  )?;

  Ok(ClientDetail {
    id,
    r#type: client_type,
    name,
    cpf_cnpj,
    status,
    email,
    phone,
    notes,
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
  payload: ClientPayload,
) -> AppResult<ClientDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;
  ensure_client_exists(&conn, &id)?;

  let (client_type, name, cpf_cnpj, email, phone, notes) = validate_client_payload(&payload)?;
  let now = now_iso();

  if let Err(err) = conn.execute(
    "UPDATE CLIENTS
     SET type = ?1, name = ?2, cpf_cnpj = ?3, email = ?4, phone = ?5, notes = ?6, updated_at = ?7
     WHERE id = ?8",
    params![
      client_type.as_str(),
      name,
      cpf_cnpj,
      email,
      phone,
      notes,
      now,
      id
    ],
  ) {
    return Err(handle_constraint_error(err));
  }

  let mut stmt = conn.prepare(
    "SELECT status, created_at FROM CLIENTS WHERE id = ?1",
  )?;
  let (status_value, created_at) = stmt.query_row(params![id.clone()], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
  })?;
  let status = parse_client_status(status_value.trim())?;

  insert_audit_log(
    &conn,
    &user.user_id,
    "update_client",
    Some("CLIENT"),
    Some(&id),
    Some("Cliente atualizado"),
    None,
  )?;

  Ok(ClientDetail {
    id,
    r#type: client_type,
    name,
    cpf_cnpj,
    status,
    email,
    phone,
    notes,
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
  let user = require_active_session(&conn, &session_id)?;
  ensure_client_exists(&conn, &id)?;

  let now = now_iso();
  conn.execute(
    "UPDATE CLIENTS SET status = ?1, updated_at = ?2 WHERE id = ?3",
    params![ClientStatus::Archived.as_str(), now, id],
  )?;

  insert_audit_log(
    &conn,
    &user.user_id,
    "archive_client",
    Some("CLIENT"),
    Some(&id),
    Some("Cliente arquivado"),
    None,
  )?;

  Ok(())
}

#[tauri::command]
fn documents_generate_html(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: DocumentGeneratePayload,
) -> AppResult<DocumentHtmlResponse> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;
  let (user_name, oab_number, oab_uf) = fetch_user_signature_info(&conn, &user.user_id)?;
  let (signature_name, signature_oab) = resolve_signature_identity(user_name, oab_number, oab_uf);
  let created_at = now_iso();
  let document_id = Uuid::new_v4().to_string();
  let signature_id = Uuid::new_v4().to_string();

  let html_base = build_abnt_html(&payload);

  let document_type = payload.document_type.as_str();
  let signature_block_for_hash = build_signature_block(
    &signature_name,
    &signature_oab,
    &payload.office_name,
    &created_at,
    None,
  );
  let signed_html_for_hash = inject_signature_block(&html_base, &signature_block_for_hash);
  let normalized_html = normalize_html_for_hash(&signed_html_for_hash);
  let document_hash = sha256_hex(normalized_html.as_bytes());
  let content_hash = sha256_hex(normalize_html_for_hash(&html_base).as_bytes());
  let signature_block = build_signature_block(
    &signature_name,
    &signature_oab,
    &payload.office_name,
    &created_at,
    Some(&document_hash),
  );
  let signed_html = inject_signature_block(&html_base, &signature_block);

  conn.execute(
    "INSERT INTO DOCUMENT_SIGNATURES
     (id, document_id, document_type, client_id, office_name, authored_by_user_id, authored_by_user_name,
      authored_by_oab, created_at, content_hash, document_hash, signature_block, signed_html)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
    params![
      signature_id,
      document_id,
      document_type,
      payload.client_id,
      payload.office_name,
      user.user_id,
      signature_name,
      signature_oab,
      created_at,
      content_hash,
      document_hash,
      signature_block,
      signed_html
    ],
  )?;

  insert_audit_log(
    &conn,
    &user.user_id,
    "generate_document_html",
    Some("DOCUMENT"),
    payload.appointment_id.as_deref(),
    Some("HTML gerado para documento"),
    Some(
      &json!({
        "documentId": document_id,
        "documentHash": document_hash
      })
      .to_string(),
    ),
  )?;

  Ok(DocumentHtmlResponse {
    html: signed_html,
    document_id,
    document_hash,
    content_hash,
    created_at,
    authored_by_name: signature_name,
    authored_by_oab: Some(signature_oab),
  })
}

#[tauri::command]
fn documents_export_html(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: DocumentExportHtmlPayload,
) -> AppResult<DocumentExportHtmlResponse> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;
  let now = now_iso();

  let mut stmt = conn.prepare(
    "SELECT signed_html FROM DOCUMENT_SIGNATURES WHERE document_id = ?1",
  )?;
  let signed_html = stmt
    .query_row(params![payload.document_id], |row| row.get::<_, String>(0))
    .map_err(|_| AppError::new("not_found", "Documento não encontrado."))?;

  fs::write(&payload.file_path, signed_html)?;

  conn.execute(
    "UPDATE DOCUMENT_SIGNATURES SET exported_path = ?1, exported_at = ?2 WHERE document_id = ?3",
    params![payload.file_path, now, payload.document_id],
  )?;

  insert_audit_log(
    &conn,
    &user.user_id,
    "export_document_html",
    Some("DOCUMENT"),
    payload.appointment_id.as_deref(),
    Some("Documento exportado"),
    Some(
      &json!({
        "documentId": payload.document_id,
        "filePath": payload.file_path
      })
      .to_string(),
    ),
  )?;

  Ok(DocumentExportHtmlResponse {
    file_path: payload.file_path,
  })
}

#[tauri::command]
fn documents_log_export(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  payload: DocumentLogExportPayload,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;
  let now = now_iso();

  let updated = conn.execute(
    "UPDATE DOCUMENT_SIGNATURES
     SET exported_at = COALESCE(exported_at, ?1)
     WHERE document_id = ?2",
    params![now, payload.document_id],
  )?;
  if updated == 0 {
    return Err(AppError::new("not_found", "Documento não encontrado."));
  }

  insert_audit_log(
    &conn,
    &user.user_id,
    "log_document_export",
    Some("DOCUMENT"),
    payload.appointment_id.as_deref(),
    Some("Exportação registrada"),
    Some(
      &json!({
        "documentId": payload.document_id,
        "format": payload.format
      })
      .to_string(),
    ),
  )?;

  Ok(())
}

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
  require_active_session(&conn, &session_id)?;
  ensure_client_exists(&conn, &client_id)?;

  let mut stmt = conn.prepare(
    "SELECT id, client_id, occurred_at, channel, subject, notes, created_at, updated_at
     FROM ATTENDANCES
     WHERE client_id = ?1
     ORDER BY occurred_at DESC, created_at DESC",
  )?;
  let mut rows = stmt.query(params![client_id])?;
  let mut attendances = Vec::new();
  while let Some(row) = rows.next()? {
    let channel: String = row.get(3)?;
    attendances.push(AttendanceSummary {
      id: row.get(0)?,
      client_id: row.get(1)?,
      occurred_at: row.get(2)?,
      channel: parse_attendance_channel(channel.trim())?,
      subject: row.get(4)?,
      notes: row.get(5)?,
      created_at: row.get(6)?,
      updated_at: row.get(7)?,
    });
  }

  Ok(attendances)
}

#[tauri::command]
fn attendances_create(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  client_id: String,
  payload: AttendancePayload,
) -> AppResult<AttendanceDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;
  ensure_client_exists(&conn, &client_id)?;

  let (occurred_at, channel, subject, notes) = validate_attendance_payload(&payload)?;
  let now = now_iso();
  let id = Uuid::new_v4().to_string();
  let channel_value = channel.as_str();

  if let Err(err) = conn.execute(
    "INSERT INTO ATTENDANCES (id, client_id, occurred_at, channel, subject, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    params![
      id,
      client_id,
      occurred_at,
      channel_value,
      subject,
      notes,
      now,
      now
    ],
  ) {
    return Err(handle_constraint_error(err));
  }

  insert_audit_log(
    &conn,
    &user.user_id,
    "create_attendance",
    Some("ATTENDANCE"),
    Some(&id),
    Some("Atendimento criado"),
    None,
  )?;

  Ok(AttendanceDetail {
    id,
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
fn attendances_update(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: String,
  attendance_id: String,
  payload: AttendancePayload,
) -> AppResult<AttendanceDetail> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;

  let mut stmt = conn.prepare(
    "SELECT client_id, created_at FROM ATTENDANCES WHERE id = ?1",
  )?;
  let current = stmt.query_row(params![attendance_id.clone()], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
  });
  let (client_id, created_at) = match current {
    Ok(row) => row,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::new("attendance_not_found", "Atendimento não encontrado."))
    }
    Err(err) => return Err(err.into()),
  };

  let (occurred_at, channel, subject, notes) = validate_attendance_payload(&payload)?;
  let now = now_iso();
  let channel_value = channel.as_str();

  if let Err(err) = conn.execute(
    "UPDATE ATTENDANCES
     SET occurred_at = ?1, channel = ?2, subject = ?3, notes = ?4, updated_at = ?5
     WHERE id = ?6",
    params![occurred_at, channel_value, subject, notes, now, attendance_id],
  ) {
    return Err(handle_constraint_error(err));
  }

  insert_audit_log(
    &conn,
    &user.user_id,
    "update_attendance",
    Some("ATTENDANCE"),
    Some(&attendance_id),
    Some("Atendimento atualizado"),
    None,
  )?;

  Ok(AttendanceDetail {
    id: attendance_id,
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
  attendance_id: String,
) -> AppResult<()> {
  let path = db_path(&app, &state)?;
  let conn = open_connection(&path)?;
  run_migrations(&conn)?;
  let user = require_active_session(&conn, &session_id)?;

  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM ATTENDANCES WHERE id = ?1",
      params![attendance_id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::new("attendance_not_found", "Atendimento não encontrado."));
  }

  conn.execute(
    "DELETE FROM ATTENDANCES WHERE id = ?1",
    params![attendance_id],
  )?;
  insert_audit_log(
    &conn,
    &user.user_id,
    "delete_attendance",
    Some("ATTENDANCE"),
    None,
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
      documents_generate_html,
      documents_export_html,
      documents_log_export,
      attendances_list,
      attendances_create,
      attendances_update,
      attendances_delete
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
