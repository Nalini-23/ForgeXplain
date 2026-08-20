"""
page_profile.py
-----------------
Basic user profile view.
"""

import streamlit as st
from database.db_interface import get_db
from utils.ui_helpers import render_page_header


def render():
    render_page_header("👤", "User Profile", "Your account and activity summary.")

    user = st.session_state.user
    db = get_db()
    predictions = db.get_predictions_for_user(st.session_state.user_id)

    col1, col2 = st.columns([1, 2])
    with col1:
        st.markdown("### Account Info")
        st.write(f"**Name:** {user.get('full_name', '—')}")
        st.write(f"**Email:** {user.get('email', '—')}")
        st.write(f"**Role:** {user.get('role', 'user').title()}")
        st.write(f"**Joined:** {str(user.get('created_at', '—'))[:10]}")

    with col2:
        st.markdown("### Activity Summary")
        st.metric("Total Predictions", len(predictions))
        if predictions:
            genuine_pct = sum(1 for p in predictions if p["prediction"] == "Genuine") / len(predictions) * 100
            st.metric("Genuine Rate", f"{genuine_pct:.1f}%")
