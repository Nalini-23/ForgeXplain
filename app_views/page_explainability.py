"""
page_explainability.py
-------------------------
Deep-dive explainability view for the most recent prediction made on the
Signature Detection page.

Shows whichever engine actually ran:
  - pixel engine    -> SHAP pixel-importance heatmap (original/importance/overlay)
  - feature engine  -> SHAP/LIME bar chart + waterfall over named features
"""

import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
from utils.config import ACTIVE_ENGINE
from utils.ui_helpers import render_page_header, render_bar_row


def render():
    render_page_header("🧠", "Explainability", "Understand exactly why the model made its last prediction.")

    if ACTIVE_ENGINE == "pixel":
        _render_pixel_explainability()
    else:
        _render_feature_explainability()


def _render_pixel_explainability():
    result = st.session_state.get("last_pixel_prediction")
    explanation = st.session_state.get("last_pixel_explanation")

    if not result or not explanation:
        st.info("Run a prediction on the **Signature Detection** page first — "
                "its explanation will appear here.")
        return

    st.subheader(f"Prediction: {result['prediction']} ({result['confidence']}% confidence)")
    st.write(f"**Explainability backend used:** {explanation['backend'].upper()}")
    st.info(explanation["plain_language"])

    st.markdown("### 1. How confident is the model?")
    st.caption("Compares how strongly the model leaned toward each class.")
    if explanation.get("confidence_chart_png"):
        st.image(explanation["confidence_chart_png"], use_container_width=False)

    st.markdown("### 2. Which part of the signature mattered most?")
    st.caption("The signature is split into four quadrants — this shows how much each one "
               "contributed to the final decision.")
    if explanation.get("quadrant_chart_png"):
        st.image(explanation["quadrant_chart_png"], use_container_width=False)
    if explanation.get("dominant_region"):
        st.write(f"👉 The **{explanation['dominant_region']}** region had the biggest influence.")

    st.markdown("### 3. Where exactly did the model look?")
    st.caption("Original signature, pixel-by-pixel importance, and both combined as an overlay. "
               "Warmer colors (red/yellow) = higher influence on the decision.")
    if explanation.get("heatmap_png"):
        st.image(explanation["heatmap_png"], use_container_width=True)

    st.markdown("### 4. How does this compare to typical genuine vs. forged patterns?")
    st.caption(
        "Genuine signatures are usually written quickly and fluidly, so strokes tend to be "
        "smoother and more even. Forged/copied signatures are often drawn slowly, which "
        "tends to show up as shakier, less consistent strokes. This chart compares your "
        "signature against those two general patterns."
    )
    if explanation.get("comparison_chart_png"):
        st.image(explanation["comparison_chart_png"], use_container_width=False)
    st.caption("Note: this comparison is a general educational reference, separate from the "
              "model's own decision (which is based on the SHAP heatmap above).")

    with st.expander("Why a heatmap instead of a feature list?"):
        st.write(
            "This model was trained directly on raw pixel values (128×128×3 = 49,152 inputs), "
            "not on named features like stroke area or aspect ratio. A ranked list of "
            "\"pixel #31,204\" wouldn't mean anything to a person, so SHAP values are "
            "computed per-pixel, summed across color channels, and shown as charts and a "
            "heatmap instead — so it's clear which strokes/regions drove the decision."
        )


def _render_feature_explainability():
    result = st.session_state.get("last_prediction")
    explanation = st.session_state.get("last_explanation")

    if not result or not explanation:
        st.info("Run a prediction on the **Signature Detection** page first — "
                "its explanation will appear here.")
        return

    st.subheader(f"Prediction: {result['prediction']} ({result['confidence']}% confidence)")
    st.write(f"**Explainability backend used:** {explanation['backend'].upper()}")
    st.info(explanation["plain_language"])

    feature_importance = explanation.get("feature_importance", {})
    if not feature_importance:
        st.warning("No feature-level explanation data available for this prediction.")
        return

    df = pd.DataFrame(
        [{"feature": k, "contribution": v} for k, v in feature_importance.items()]
    ).sort_values("contribution", key=abs, ascending=False)

    st.subheader("Explainability (Top Contributing Features)")
    top = explanation.get("top_features", [])[:8] or list(
        df.itertuples(index=False, name=None)
    )[:8]
    if top:
        max_abs = max(abs(v) for _, v in top) or 1.0
        for name, value in top:
            render_bar_row(name.replace("_", " ").title(), value, max_abs)
        st.markdown("**Interpretation:**")
        for name, value in top:
            direction = "↑ Genuine" if value > 0 else "↓ Forged"
            st.write(f"- `{name}`: {value:+.4f} ({direction})")
    else:
        st.warning("No ranked top features available.")
