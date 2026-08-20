"""
local_store.py
---------------
SQLite implementation of DBInterface. This is the default backend so the
app runs fully offline with no external account needed. Schema mirrors
what the Supabase/Postgres tables look like (see supabase_schema.sql),
so migrating data later is a straightforward export/import.
"""

import sqlite3
import uuid
import json
from datetime import datetime, timezone
from threading import Lock
from typing import Optional, List, Dict, Any

from database.db_interface import DBInterface
from utils.config import LOCAL_DB_PATH
from utils.logger import get_logger

logger = get_logger(__name__)
_lock = Lock()


class LocalSQLiteDB(DBInterface):
    def __init__(self):
        self.path = str(LOCAL_DB_PATH)
        self._init_schema()

    def _connect(self):
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self):
        with _lock, self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    full_name TEXT,
                    role TEXT DEFAULT 'user',
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    image_filename TEXT,
                    prediction TEXT,
                    confidence REAL,
                    model_used TEXT,
                    prediction_time_ms REAL,
                    features_json TEXT,
                    explanation_summary TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS signers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    feature_vector_json TEXT NOT NULL,
                    num_samples INTEGER NOT NULL,
                    registered_by TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            conn.commit()
        logger.info("Local SQLite schema ready at %s", self.path)

    # ---- Users ----------------------------------------------------------
    def create_user(self, email, password_hash, full_name, role="user"):
        user_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        with _lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, full_name, role, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, email.lower().strip(), password_hash, full_name, role, created_at),
            )
            conn.commit()
        logger.info("Created user %s (role=%s)", email, role)
        return {"id": user_id, "email": email, "full_name": full_name,
                "role": role, "created_at": created_at}

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def update_user_password(self, email: str, new_password_hash: str) -> bool:
        with _lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET password_hash = ? WHERE email = ?",
                (new_password_hash, email.lower().strip()),
            )
            conn.commit()
        return cur.rowcount > 0

    def list_users(self) -> List[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_user(self, user_id: str) -> bool:
        with _lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            conn.commit()
        return cur.rowcount > 0

    # ---- Predictions ------------------------------------------------------
    def save_prediction(self, record: Dict[str, Any]) -> Dict[str, Any]:
        record = dict(record)
        record.setdefault("id", str(uuid.uuid4()))
        record.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        features_json = json.dumps(record.get("features", {}))
        with _lock, self._connect() as conn:
            conn.execute(
                """INSERT INTO predictions
                   (id, user_id, image_filename, prediction, confidence, model_used,
                    prediction_time_ms, features_json, explanation_summary, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (record["id"], record["user_id"], record.get("image_filename"),
                 record.get("prediction"), record.get("confidence"),
                 record.get("model_used"), record.get("prediction_time_ms"),
                 features_json, record.get("explanation_summary"), record["created_at"]),
            )
            conn.commit()
        logger.info("Saved prediction %s for user %s", record["id"], record["user_id"])
        return record

    def get_predictions_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM predictions WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_all_predictions(self) -> List[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM predictions ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    # ---- Registered signers (writer-dependent verification) ---------------
    def register_signer(self, name: str, feature_vector: List[float],
                         num_samples: int, registered_by: str) -> Dict[str, Any]:
        signer_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        vec_json = json.dumps(list(map(float, feature_vector)))
        with _lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO signers (id, name, feature_vector_json, num_samples, registered_by, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (signer_id, name.strip(), vec_json, num_samples, registered_by, created_at),
            )
            conn.commit()
        logger.info("Registered signer '%s' (%d reference sample(s))", name, num_samples)
        return {"id": signer_id, "name": name.strip(), "feature_vector": feature_vector,
                "num_samples": num_samples, "registered_by": registered_by, "created_at": created_at}

    def list_signers(self) -> List[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, num_samples, registered_by, created_at FROM signers ORDER BY name"
            ).fetchall()
        return [dict(r) for r in rows]

    def get_signer_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        with _lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM signers WHERE name = ?", (name.strip(),)
            ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["feature_vector"] = json.loads(d.pop("feature_vector_json"))
        return d

    def delete_signer(self, signer_id: str) -> bool:
        with _lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM signers WHERE id = ?", (signer_id,))
            conn.commit()
        return cur.rowcount > 0

    @staticmethod
    def _row_to_dict(row) -> Dict[str, Any]:
        d = dict(row)
        try:
            d["features"] = json.loads(d.pop("features_json", "{}") or "{}")
        except json.JSONDecodeError:
            d["features"] = {}
        return d
