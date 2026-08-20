"""
db_interface.py
----------------
Abstract interface every storage backend must implement.

The rest of the application (auth, pages, prediction pipeline) imports
`get_db()` from this file and never talks to SQLite or Supabase directly.
This is the seam that lets STORAGE_BACKEND switch from "local" to
"supabase" (or later "postgres", "dynamodb", etc.) with zero changes
anywhere else in the codebase.
"""

from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
import streamlit as st
from utils.config import STORAGE_BACKEND


class DBInterface(ABC):
    """Contract for user + prediction-history + metadata persistence."""

    # ---- Users --------------------------------------------------------
    @abstractmethod
    def create_user(self, email: str, password_hash: str, full_name: str,
                     role: str = "user") -> Dict[str, Any]:
        ...

    @abstractmethod
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    def update_user_password(self, email: str, new_password_hash: str) -> bool:
        ...

    @abstractmethod
    def list_users(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def delete_user(self, user_id: str) -> bool:
        ...

    # ---- Predictions ----------------------------------------------------
    @abstractmethod
    def save_prediction(self, record: Dict[str, Any]) -> Dict[str, Any]:
        ...

    @abstractmethod
    def get_predictions_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def get_all_predictions(self) -> List[Dict[str, Any]]:
        ...

    # ---- Registered signers (writer-dependent verification) -----------
    # Not marked @abstractmethod: this is an optional capability of a
    # backend. Default raises so a backend that hasn't implemented it yet
    # (e.g. SupabaseDB, which only has the schema above ported over)
    # fails loudly and specifically if the feature is used, rather than
    # silently breaking every other method via a failed instantiation.
    def register_signer(self, name: str, feature_vector: List[float],
                         num_samples: int, registered_by: str) -> Dict[str, Any]:
        raise NotImplementedError("This storage backend does not support registered signers yet.")

    def list_signers(self) -> List[Dict[str, Any]]:
        raise NotImplementedError("This storage backend does not support registered signers yet.")

    def get_signer_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError("This storage backend does not support registered signers yet.")

    def delete_signer(self, signer_id: str) -> bool:
        raise NotImplementedError("This storage backend does not support registered signers yet.")


@st.cache_resource(show_spinner=False)
def get_db() -> DBInterface:
    """
    Factory returning the active backend based on config.STORAGE_BACKEND.
    Cached — previously this built a brand-new LocalSQLiteDB (which re-runs
    CREATE TABLE IF NOT EXISTS + acquires a lock) on every single prediction.
    Now the connection is opened once per session and reused.
    """
    if STORAGE_BACKEND == "supabase":
        from database.supabase_client import SupabaseDB
        return SupabaseDB()
    else:
        from database.local_store import LocalSQLiteDB
        return LocalSQLiteDB()
