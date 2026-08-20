"""
page_home.py
-------------
Home dashboard: quick-glance summary cards + recent activity chart,
scoped to the logged-in user (admins additionally see system-wide stats).
"""

import streamlit as st
import pandas as pd
from database.db_interface import get_db
from utils.config import APP_NAME
from utils.ui_helpers import render_page_header


def render():
    full_name = (st.session_state.user or {}).get("full_name", "").split(" ")[0] or "there"
    render_page_header("✍️", f"Welcome back, {full_name} 👋", "Detect. Explain. Trust.")

    db = get_db()
    user_id = st.session_state.user_id
    is_admin = st.session_state.role == "admin"

    predictions = db.get_all_predictions() if is_admin else db.get_predictions_for_user(user_id)

    total = len(predictions)
    genuine = sum(1 for p in predictions if p.get("prediction") == "Genuine")
    forged = sum(1 for p in predictions if p.get("prediction") == "Forged")
    avg_conf = (sum(p.get("confidence", 0) for p in predictions) / total) if total else 0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Analyses", total)
    c2.metric("Genuine", genuine, f"{(genuine/total*100):.1f}%" if total else None)
    c3.metric("Forgery Detected", forged, f"{(forged/total*100):.1f}%" if total else None, delta_color="inverse")
    c4.metric("Avg. Confidence", f"{avg_conf:.1f}%")

    st.divider()

    if total:
        df = pd.DataFrame(predictions)
        df["created_at"] = pd.to_datetime(df["created_at"])
        df = df.sort_values("created_at")

        col1, col2 = st.columns([2, 1])
        with col1:
            st.subheader("Prediction Timeline")
            daily = df.groupby([df["created_at"].dt.date, "prediction"]).size().unstack(fill_value=0)
            st.bar_chart(daily)

        with col2:
            st.subheader("Outcome Split")
            split = df["prediction"].value_counts()
            st.dataframe(split.rename("count"), use_container_width=True)

        st.subheader("Recent Activity")
        display_cols = ["created_at", "prediction", "confidence", "model_used"]
        available_cols = [c for c in display_cols if c in df.columns]
        st.dataframe(
            df[available_cols].sort_values("created_at", ascending=False).head(10),
            use_container_width=True, hide_index=True,
        )
    else:
        st.info("No predictions yet. Head to **Signature Detection** to analyze your first signature.")

    st.divider()
    with st.expander("What is ForgeXplain?"):
        st.write(
            "ForgeXplain analyzes offline handwritten signature images using computer vision "
            "and machine learning (SVM + Random Forest ensemble) to classify them as **Genuine** "
            "or **Forged**, and explains every decision using SHAP/LIME so results are transparent "
            "and auditable rather than a black-box verdict."
        )
