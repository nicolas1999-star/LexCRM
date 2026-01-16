from __future__ import annotations

import csv
import io
import os
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import DB_PATH, get_config_value, get_connection, init_db, set_config_value

ADMIN_ROLES = {"ADMIN", "PARTNER"}
APP_ROOT = Path(__file__).resolve().parent
DOCS_PATH = APP_ROOT / "documents"

app = FastAPI()
app.mount("/static", StaticFiles(directory=APP_ROOT / "static"), name="static")


def require_role(x_role: Optional[str] = Header(None)) -> str:
    if x_role is None or x_role.upper() not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Acesso restrito")
    return x_role


def get_user_id(x_user_id: Optional[str] = Header(None)) -> str:
    return x_user_id or "anonymous"


def log_audit(action: str, entity_type: Optional[str], message: str, user_id: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO audit_events(created_at, user_id, action, entity_type, message) VALUES(?, ?, ?, ?, ?)",
            (datetime.utcnow().isoformat(), user_id, action, entity_type, message),
        )
        conn.commit()


def parse_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return datetime.fromisoformat(value).isoformat()


def require_reauth_if_configured(x_reauth: Optional[str] = Header(None)) -> None:
    require_reauth = get_config_value("require_reauth_for_sensitive_actions", "false")
    if require_reauth.lower() == "true" and (x_reauth or "").lower() != "true":
        raise HTTPException(status_code=403, detail="Reautenticação necessária")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    DOCS_PATH.mkdir(parents=True, exist_ok=True)


@app.get("/admin/audit", response_class=HTMLResponse)
async def admin_audit_page() -> HTMLResponse:
    with open(APP_ROOT / "static" / "admin" / "audit.html", "r", encoding="utf-8") as file:
        return HTMLResponse(file.read())


@app.get("/admin/backup", response_class=HTMLResponse)
async def admin_backup_page() -> HTMLResponse:
    with open(APP_ROOT / "static" / "admin" / "backup.html", "r", encoding="utf-8") as file:
        return HTMLResponse(file.read())


@app.get("/api/audit")
def audit_list(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    _: str = Depends(require_role),
) -> Dict[str, Any]:
    filters: List[str] = []
    values: List[Any] = []
    if from_date:
        filters.append("created_at >= ?")
        values.append(parse_date(from_date))
    if to_date:
        filters.append("created_at <= ?")
        values.append(parse_date(to_date))
    if user_id:
        filters.append("user_id = ?")
        values.append(user_id)
    if action:
        filters.append("action = ?")
        values.append(action)
    if entity_type:
        filters.append("entity_type = ?")
        values.append(entity_type)
    if q:
        filters.append("message LIKE ?")
        values.append(f"%{q}%")

    where_clause = " AND ".join(filters)
    if where_clause:
        where_clause = f"WHERE {where_clause}"

    limit = max(1, min(page_size, 100))
    offset = max(0, (page - 1) * limit)

    with get_connection() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM audit_events {where_clause}", values).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM audit_events {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            values + [limit, offset],
        ).fetchall()

    return {
        "items": [dict(row) for row in rows],
        "page": page,
        "page_size": limit,
        "total": total,
    }


@app.get("/api/audit/export")
def audit_export_csv(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    q: Optional[str] = None,
    role: str = Depends(require_role),
    x_reauth: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
) -> FileResponse:
    require_reauth_if_configured(x_reauth)

    filters: List[str] = []
    values: List[Any] = []
    if from_date:
        filters.append("created_at >= ?")
        values.append(parse_date(from_date))
    if to_date:
        filters.append("created_at <= ?")
        values.append(parse_date(to_date))
    if user_id:
        filters.append("user_id = ?")
        values.append(user_id)
    if action:
        filters.append("action = ?")
        values.append(action)
    if entity_type:
        filters.append("entity_type = ?")
        values.append(entity_type)
    if q:
        filters.append("message LIKE ?")
        values.append(f"%{q}%")

    where_clause = " AND ".join(filters)
    if where_clause:
        where_clause = f"WHERE {where_clause}"

    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM audit_events {where_clause} ORDER BY created_at DESC", values
        ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "created_at", "user_id", "action", "entity_type", "entity_id", "message"])
    for row in rows:
        writer.writerow(
            [row["id"], row["created_at"], row["user_id"], row["action"], row["entity_type"], row["entity_id"], row["message"]]
        )

    export_dir = APP_ROOT / "data" / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    filename = f"audit_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    file_path = export_dir / filename
    file_path.write_text(output.getvalue(), encoding="utf-8")

    log_audit("export", "audit", f"Export CSV ({role})", get_user_id(x_user_id))

    return FileResponse(file_path, media_type="text/csv", filename=filename)


@app.get("/api/backup/settings")
def backup_get_settings(_: str = Depends(require_role)) -> Dict[str, Any]:
    return {
        "backup_dir": get_config_value("backup_dir", ""),
        "backup_retention_count": int(get_config_value("backup_retention_count", "30")),
        "backup_frequency": get_config_value("backup_frequency", "DAILY"),
    }


@app.post("/api/backup/settings")
def backup_set_settings(payload: Dict[str, Any], _: str = Depends(require_role)) -> Dict[str, Any]:
    backup_dir = payload.get("backup_dir") or ""
    retention = int(payload.get("backup_retention_count") or 30)
    frequency = payload.get("backup_frequency") or "DAILY"
    set_config_value("backup_dir", backup_dir)
    set_config_value("backup_retention_count", str(retention))
    set_config_value("backup_frequency", frequency)
    return {"status": "ok"}


def resolve_backup_dir() -> Path:
    backup_dir = get_config_value("backup_dir", "")
    if not backup_dir:
        raise HTTPException(status_code=400, detail="Backup directory não configurado")
    path = Path(backup_dir).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


@app.post("/api/backup/create")
def backup_create_now(
    role: str = Depends(require_role), x_user_id: Optional[str] = Header(None)
) -> Dict[str, Any]:
    backup_dir = resolve_backup_dir()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    zip_path = backup_dir / f"backup_{timestamp}.zip"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if DB_PATH.exists():
            zf.write(DB_PATH, arcname="db.sqlite")
        if DOCS_PATH.exists():
            for file in DOCS_PATH.rglob("*"):
                if file.is_file():
                    zf.write(file, arcname=str(Path("documents") / file.relative_to(DOCS_PATH)))

    retention = int(get_config_value("backup_retention_count", "30"))
    backups = sorted(backup_dir.glob("backup_*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    for extra in backups[retention:]:
        extra.unlink(missing_ok=True)

    log_audit("backup_create", "backup", f"Backup criado ({role})", get_user_id(x_user_id))

    return {"status": "ok", "path": str(zip_path)}


@app.get("/api/backup/list")
def backup_list(_: str = Depends(require_role)) -> List[Dict[str, Any]]:
    backup_dir = resolve_backup_dir()
    backups = []
    for file in sorted(backup_dir.glob("backup_*.zip"), key=lambda p: p.stat().st_mtime, reverse=True):
        backups.append(
            {
                "name": file.name,
                "path": str(file),
                "size": file.stat().st_size,
                "modified_at": datetime.fromtimestamp(file.stat().st_mtime).isoformat(),
            }
        )
    return backups


@app.post("/api/backup/restore")
def backup_restore(
    payload: Dict[str, Any],
    role: str = Depends(require_role),
    x_user_id: Optional[str] = Header(None),
) -> Dict[str, Any]:
    backup_path = payload.get("path")
    if not backup_path:
        raise HTTPException(status_code=400, detail="Caminho do backup é obrigatório")

    backup_file = Path(backup_path).expanduser().resolve()
    if not backup_file.exists():
        raise HTTPException(status_code=404, detail="Backup não encontrado")

    temp_dir = APP_ROOT / "data" / "restore"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(backup_file, "r") as zf:
        zf.extractall(temp_dir)

    db_source = temp_dir / "db.sqlite"
    if db_source.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(db_source, DB_PATH)

    docs_source = temp_dir / "documents"
    if docs_source.exists():
        DOCS_PATH.mkdir(parents=True, exist_ok=True)
        for file in docs_source.rglob("*"):
            if file.is_file():
                target = DOCS_PATH / file.relative_to(docs_source)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, target)

    log_audit("backup_restore", "backup", f"Backup restaurado ({role})", get_user_id(x_user_id))

    return {
        "status": "ok",
        "message": "Backup restaurado. Reinicie a aplicação para garantir o carregamento correto dos dados.",
    }


@app.post("/api/db/integrity_check")
def db_integrity_check(
    role: str = Depends(require_role), x_user_id: Optional[str] = Header(None)
) -> Dict[str, Any]:
    with get_connection() as conn:
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]

    log_audit("integrity_check", "database", f"Integrity check ({role})", get_user_id(x_user_id))

    return {"result": result}


@app.post("/api/db/vacuum")
def db_vacuum(role: str = Depends(require_role), x_user_id: Optional[str] = Header(None)) -> Dict[str, Any]:
    with get_connection() as conn:
        conn.execute("VACUUM")
        conn.commit()

    log_audit("vacuum", "database", f"Vacuum ({role})", get_user_id(x_user_id))

    return {"status": "ok"}
