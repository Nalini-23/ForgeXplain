"""
auth_manager.py
----------------
Handles sign up, login, logout, and forgot-password flows.

Passwords are hashed with bcrypt before ever touching storage (for the
local backend). When STORAGE_BACKEND=supabase, Supabase Auth performs its
own hashing server-side; this module still validates input the same way
so the UI layer never needs to know which backend is active.
"""

import re
import bcrypt
import secrets
import string
from typing import Optional, Dict, Any, Tuple

from database.db_interface import get_db
from utils.config import PASSWORD_MIN_LENGTH, STORAGE_BACKEND
from utils.logger import get_logger

logger = get_logger(__name__)

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


class AuthError(Exception):
    """Raised for any user-facing auth failure (bad password, duplicate email, etc.)."""


def validate_email(email: str) -> bool:
    return bool(EMAIL_REGEX.match(email.strip()))


def validate_password(password: str) -> Tuple[bool, str]:
    """Returns (is_valid, message). Enforces a reasonable minimum-strength policy."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return False, f"Password must be at least {PASSWORD_MIN_LENGTH} characters."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one digit."
    return True, "OK"


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def sign_up(email: str, password: str, full_name: str, role: str = "user") -> Dict[str, Any]:
    """Creates a new account. Raises AuthError on any validation/duplicate failure."""
    email = email.strip().lower()
    if not validate_email(email):
        raise AuthError("Please enter a valid email address.")

    ok, msg = validate_password(password)
    if not ok:
        raise AuthError(msg)

    if not full_name.strip():
        raise AuthError("Full name is required.")

    db = get_db()
    if db.get_user_by_email(email):
        raise AuthError("An account with this email already exists.")

    # Bootstrap: the very first account created on a fresh install becomes
    # admin automatically, so there's always at least one admin without
    # needing manual DB edits. Every subsequent sign-up is a regular user.
    try:
        if not db.list_users():
            role = "admin"
    except Exception:
        pass

    # For the local backend we store a bcrypt hash. For Supabase, auth.sign_up
    # takes the raw password directly (Supabase does its own hashing), so we
    # pass the plaintext through in that case — see supabase_client.create_user.
    password_payload = password if STORAGE_BACKEND == "supabase" else _hash_password(password)

    user = db.create_user(email=email, password_hash=password_payload,
                           full_name=full_name.strip(), role=role)
    logger.info("New sign-up: %s", email)
    return user


def login(email: str, password: str) -> Dict[str, Any]:
    """Authenticates a user. Raises AuthError on invalid credentials."""
    email = email.strip().lower()
    db = get_db()
    user = db.get_user_by_email(email)

    if not user:
        raise AuthError("Invalid email or password.")

    if STORAGE_BACKEND == "supabase":
        try:
            resp = db.client.auth.sign_in_with_password({"email": email, "password": password})
            if not resp.user:
                raise AuthError("Invalid email or password.")
        except Exception:
            raise AuthError("Invalid email or password.")
    else:
        if not _verify_password(password, user["password_hash"]):
            raise AuthError("Invalid email or password.")

    logger.info("Login success: %s", email)
    return user


def logout(session_state) -> None:
    """Clears all auth-related keys from Streamlit's session_state."""
    for key in ["authenticated", "user", "user_id", "role"]:
        session_state.pop(key, None)
    logger.info("User logged out.")


def generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def forgot_password(email: str) -> str:
    """
    Local backend: generates a temporary password, hashes + stores it, and
    returns it so the UI can display it (in production this would be emailed
    via an SMTP/SES integration instead of shown on-screen).

    Supabase backend: triggers Supabase's built-in password-reset email.
    """
    email = email.strip().lower()
    db = get_db()
    user = db.get_user_by_email(email)
    if not user:
        raise AuthError("No account found with this email.")

    if STORAGE_BACKEND == "supabase":
        db.client.auth.reset_password_for_email(email)
        return "A password reset link has been sent to your email."

    temp_password = generate_temp_password()
    db.update_user_password(email, _hash_password(temp_password))
    logger.info("Temporary password issued for %s", email)
    return temp_password
