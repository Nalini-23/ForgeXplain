"""
app.py
-------
ForgeXplain main entry point.

Handles:
    - page config + global CSS (light/dark aware)
    - session-state bootstrapping
    - routing between the auth screens and the authenticated dashboard
"""

import streamlit as st
from pathlib import Path

from utils.config import APP_NAME, APP_TAGLINE, APP_VERSION, ASSETS_DIR
from utils.logger import get_logger

logger = get_logger(__name__)

st.set_page_config(
    page_title=f"{APP_NAME} | {APP_TAGLINE}",
    page_icon="✍️",
    layout="wide",
    initial_sidebar_state="expanded",
)


def load_css():
    css_path = ASSETS_DIR / "css" / "style.css"
    if css_path.exists():
        st.markdown(f"<style>{css_path.read_text()}</style>", unsafe_allow_html=True)


def init_session_state():
    defaults = {
        "authenticated": False,
        "user": None,
        "user_id": None,
        "role": None,
        "auth_view": "login",  # login | signup | forgot_password
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def render_sidebar_branding():
    with st.sidebar:
        st.markdown(
            f"""
            <div style="text-align:center; padding: 0.75rem 0 1.1rem 0;">
                <div style="
                    width:58px; height:58px; margin:0 auto 0.6rem auto;
                    border-radius:16px;
                    background: linear-gradient(135deg, #7C3AED 0%, #A855F7 55%, #D946EF 100%);
                    display:flex; align-items:center; justify-content:center;
                    box-shadow: 0 4px 18px rgba(168,85,247,0.45);
                    font-size:1.6rem; font-weight:800; color:white; font-family:'Inter',sans-serif;">
                    Fx
                </div>
                <h1 style="margin-bottom:0; font-size:1.4rem;">{APP_NAME}</h1>
                <p style="color:#A78BFA; font-size:0.78rem; margin-top:2px; font-weight:600;">{APP_TAGLINE}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("<div style='border-top:1px solid rgba(139,92,246,0.18); margin: 0.4rem 0 0.8rem 0;'></div>",
                     unsafe_allow_html=True)


def main():
    init_session_state()
    load_css()
    render_sidebar_branding()

    if not st.session_state.authenticated:
        from app_views import page_auth
        page_auth.render()
        return

    # ---- Authenticated navigation ------------------------------------------
    with st.sidebar:
        st.markdown(f"**Signed in as:** {st.session_state.user.get('full_name', '')}")
        st.caption(f"{st.session_state.user.get('email','')} · {st.session_state.role}")

        nav_options = ["🏠 Home Dashboard", "🔍 Signature Detection", "📊 Model Performance",
                        "🧠 Explainability", "🕘 Prediction History", "👤 User Profile", "ℹ️ About"]
        if st.session_state.role == "admin":
            nav_options.insert(1, "🛠️ Admin Panel")

        choice = st.radio("Navigate", nav_options, label_visibility="collapsed")

        st.divider()
        if st.button("🚪 Logout", use_container_width=True):
            from auth.auth_manager import logout
            logout(st.session_state)
            st.rerun()

        st.caption(f"v{APP_VERSION}")

    if choice == "🏠 Home Dashboard":
        from app_views import page_home
        page_home.render()
    elif choice == "🛠️ Admin Panel":
        from app_views import page_admin
        page_admin.render()
    elif choice == "🔍 Signature Detection":
        from app_views import page_detection
        page_detection.render()
    elif choice == "📊 Model Performance":
        from app_views import page_performance
        page_performance.render()
    elif choice == "🧠 Explainability":
        from app_views import page_explainability
        page_explainability.render()
    elif choice == "🕘 Prediction History":
        from app_views import page_history
        page_history.render()
    elif choice == "👤 User Profile":
        from app_views import page_profile
        page_profile.render()
    elif choice == "ℹ️ About":
        from app_views import page_about
        page_about.render()


if __name__ == "__main__":
    main()
