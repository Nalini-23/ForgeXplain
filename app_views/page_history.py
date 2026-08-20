"""
page_history.py
-----------------
Shows the logged-in user's personal prediction history with filters.
"""

import streamlit as st
import pandas as pd
from database.db_interface import get_db
from utils.ui_helpers import render_page_header


def render():
    render_page_header("🕘", "Prediction History", "Every signature you've analyzed, in one place.")

    db = get_db()
    predictions = db.get_predictions_for_user(st.session_state.user_id)

    if not predictions:
        st.info("You haven't made any predictions yet.")
        return

    df = pd.DataFrame(predictions)
    df["created_at"] = pd.to_datetime(df["created_at"])
    df = df.sort_values("created_at", ascending=False)

    col1, col2 = st.columns(2)
    with col1:
        filter_pred = st.multiselect("Filter by prediction", options=df["prediction"].unique().tolist(),
                                      default=df["prediction"].unique().tolist())
    with col2:
        filter_model = st.multiselect("Filter by model", options=df["model_used"].unique().tolist(),
                                       default=df["model_used"].unique().tolist())

    filtered = df[df["prediction"].isin(filter_pred) & df["model_used"].isin(filter_model)]

    st.dataframe(
        filtered[["created_at", "image_filename", "prediction", "confidence",
                  "model_used", "prediction_time_ms"]],
        use_container_width=True, hide_index=True,
    )

    st.download_button(
        "⬇️ Export as CSV", data=filtered.to_csv(index=False).encode("utf-8"),
        file_name="forgexplain_prediction_history.csv", mime="text/csv",
    )

    st.divider()
    st.subheader("Explanation Summaries")
    for _, row in filtered.head(20).iterrows():
        with st.expander(f"{row['created_at']} — {row['prediction']} ({row['confidence']}%)"):
            st.write(row.get("explanation_summary", "No explanation stored."))
