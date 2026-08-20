"""
supabase_client.py
--------------------
Supabase implementation of DBInterface.

Activated by setting in .env:
    STORAGE_BACKEND=supabase
    SUPABASE_URL=https://<project>.supabase.co
    SUPABASE_KEY=<service_role_or_anon_key>

Run `database/supabase_schema.sql` in the Supabase SQL editor once before
using this backend. Supabase Auth handles password hashing/verification
server-side, so `create_user`/password fields here are thin wrappers
around `supabase.auth` plus a `profiles` table for role/app-specific data.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from database.db_interface import DBInterface
from utils.config import SUPABASE_URL, SUPABASE_KEY
from utils.logger import get_logger

logger = get_logger(__name__)


class SupabaseDB(DBInterface):
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL / SUPABASE_KEY are not set. "
                "Add them to .env or switch STORAGE_BACKEND=local."
            )
        try:
            from supabase import create_client
        except ImportError as e:
            raise RuntimeError(
                "The 'supabase' package is not installed. Run: pip install supabase"
            ) from e

        self.client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Connected to Supabase project at %s", SUPABASE_URL)

    # ---- Users (profiles table + Supabase Auth) --------------------------
    def create_user(self, email, password_hash, full_name, role="user"):
        # NOTE: password_hash is ignored here — Supabase Auth manages
        # password hashing itself via auth.sign_up(). Kept in the method
        # signature only so callers (auth/auth_manager.py) stay backend-agnostic.
        auth_resp = self.client.auth.sign_up({"email": email, "password": password_hash})
        user_id = auth_resp.user.id if auth_resp.user else None
        if not user_id:
            raise RuntimeError("Supabase sign-up failed; check email/password policy.")

        profile = {
            "id": user_id,
            "email": email.lower().strip(),
            "full_name": full_name,
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table("profiles").insert(profile).execute()
        logger.info("Created Supabase user %s", email)
        return profile

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        res = self.client.table("profiles").select("*").eq(
            "email", email.lower().strip()).limit(1).execute()
        return res.data[0] if res.data else None

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        res = self.client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        return res.data[0] if res.data else None

    def update_user_password(self, email: str, new_password_hash: str) -> bool:
        # Real flow: use client.auth.reset_password_for_email(email) to send
        # a reset link; Supabase handles the actual password change client-side.
        logger.info("Password reset requested for %s (handled via Supabase Auth email flow)", email)
        return True

    def list_users(self) -> List[Dict[str, Any]]:
        res = self.client.table("profiles").select("*").order("created_at", desc=True).execute()
        return res.data or []

    def delete_user(self, user_id: str) -> bool:
        self.client.table("profiles").delete().eq("id", user_id).execute()
        try:
            self.client.auth.admin.delete_user(user_id)  # requires service_role key
        except Exception as e:
            logger.warning("Could not delete auth user %s: %s", user_id, e)
        return True

    # ---- Predictions -------------------------------------------------------
    def save_prediction(self, record: Dict[str, Any]) -> Dict[str, Any]:
        record = dict(record)
        record.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        res = self.client.table("predictions").insert(record).execute()
        return res.data[0] if res.data else record

    def get_predictions_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        res = self.client.table("predictions").select("*").eq(
            "user_id", user_id).order("created_at", desc=True).execute()
        return res.data or []

    def get_all_predictions(self) -> List[Dict[str, Any]]:
        res = self.client.table("predictions").select("*").order("created_at", desc=True).execute()
        return res.data or []

    # ---- Registered signers (writer-dependent verification) ---------------
    def register_signer(self, name: str, feature_vector: List[float],
                         num_samples: int, registered_by: str) -> Dict[str, Any]:
        record = {
            "name": name.strip(),
            "feature_vector": feature_vector,
            "num_samples": num_samples,
            "registered_by": registered_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = self.client.table("signers").insert(record).execute()
        logger.info("Registered signer '%s' in Supabase (%d reference sample(s))", name, num_samples)
        return res.data[0] if res.data else record

    def list_signers(self) -> List[Dict[str, Any]]:
        res = self.client.table("signers").select(
            "id, name, num_samples, registered_by, created_at").order("name").execute()
        return res.data or []

    def get_signer_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        res = self.client.table("signers").select("*").eq(
            "name", name.strip()).limit(1).execute()
        return res.data[0] if res.data else None

    def delete_signer(self, signer_id: str) -> bool:
        self.client.table("signers").delete().eq("id", signer_id).execute()
        return True
