"""
page_performance.py
----------------------
Displays model comparison metrics. For the pixel-based engine (your
uploaded random_forest_model.joblib), this model was trained externally
in a notebook, so accuracy/precision/recall/F1/confusion-matrix/ROC
numbers aren't available inside this app unless you paste them in below.
For the engineered-feature engine, metrics are computed automatically
during in-app training and shown in full.
"""

import streamlit as st
import pandas as pd
import numpy as np
import json
from utils.config import ACTIVE_ENGINE, TRAINED_MODELS_DIR
from utils.ui_helpers import render_page_header


def render():
    render_page_header("📊", "Model Performance", "Comparison of trained models on the held-out test set.")

    st.markdown(
        """
        <div class="fx-card" style="display:flex; align-items:center; gap:1.2rem; flex-wrap:wrap;">
            <div>
                <p class="fx-card-title" style="margin-bottom:0.3rem;">Hybrid ML Model</p>
                <p style="color:#9B96B8; font-size:0.88rem; margin:0; max-width:640px;">
                    Our ensemble approach combines pixel-level pattern recognition with a
                    Random Forest classifier, layered with SHAP-based explainability so every
                    verdict comes with a "why", not just a score.
                </p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div style='margin-top:0.6rem;'></div>", unsafe_allow_html=True)
    pipe_cols = st.columns(5)
    for col, (icon, label) in zip(pipe_cols, [
        ("🧹", "Preprocessing"), ("🧩", "Feature Extraction"), ("📐", "SVM"),
        ("🌲", "Random Forest"), ("✅", "Prediction"),
    ]):
        with col:
            st.markdown(
                f"""<div style="text-align:center; background:#15121F; border:1px solid rgba(139,92,246,0.2);
                border-radius:14px; padding:0.8rem 0.4rem;">
                <div style="font-size:1.4rem;">{icon}</div>
                <div style="font-size:0.78rem; color:#9B96B8; font-weight:600; margin-top:0.2rem;">{label}</div>
                </div>""",
                unsafe_allow_html=True,
            )
    st.markdown("<div style='margin-top:1rem;'></div>", unsafe_allow_html=True)

    if ACTIVE_ENGINE == "pixel":
        _render_pixel_performance()
    else:
        _render_feature_performance()


def _render_pixel_performance():
    st.info(
        "The active model (**random_forest_model.joblib**) was trained outside this app "
        "in a notebook, so per-run evaluation metrics weren't exported alongside it."
    )

    external_metrics_path = TRAINED_MODELS_DIR / "external_model_metrics.json"
    existing = {}
    if external_metrics_path.exists():
        with open(external_metrics_path) as f:
            existing = json.load(f)

    has_real_metrics = existing and any(v > 0 for v in existing.values() if isinstance(v, (int, float)))

    if has_real_metrics:
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Accuracy", f"{existing.get('accuracy', 0)*100:.2f}%")
        c2.metric("Precision", f"{existing.get('precision', 0)*100:.2f}%")
        c3.metric("Recall", f"{existing.get('recall', 0)*100:.2f}%")
        c4.metric("F1 Score", f"{existing.get('f1_score', 0)*100:.2f}%")
        if "confusion_matrix" in existing:
            st.markdown("**Confusion Matrix**")
            cm = np.array(existing["confusion_matrix"])
            st.dataframe(pd.DataFrame(
                cm, index=["Actual: Forged", "Actual: Genuine"],
                columns=["Predicted: Forged", "Predicted: Genuine"],
            ), use_container_width=True)
        st.divider()
        expander_label = "✏️ Edit metrics"
    else:
        if existing:
            st.warning("Saved metrics are all 0% — looks like the form was submitted before "
                       "numbers were entered. Fill in the real values below and save again.")
        expander_label = "📝 Add your notebook's evaluation metrics"

    with st.expander(expander_label, expanded=not has_real_metrics):
        st.caption(
            "Paste the accuracy/precision/recall/F1 you got when comparing CNN, SVM, and "
            "Random Forest in your notebook."
        )
        with st.form("metrics_form"):
            c1, c2 = st.columns(2)
            accuracy = c1.number_input("Accuracy (%)", 0.0, 100.0,
                                        value=float(existing.get("accuracy", 0)) * 100.0, step=0.1)
            precision = c2.number_input("Precision (%)", 0.0, 100.0,
                                         value=float(existing.get("precision", 0)) * 100.0, step=0.1)
            recall = c1.number_input("Recall (%)", 0.0, 100.0,
                                      value=float(existing.get("recall", 0)) * 100.0, step=0.1)
            f1 = c2.number_input("F1 Score (%)", 0.0, 100.0,
                                  value=float(existing.get("f1_score", 0)) * 100.0, step=0.1)
            submitted = st.form_submit_button("Save Metrics", type="primary")

        if submitted:
            if accuracy == 0 and precision == 0 and recall == 0 and f1 == 0:
                st.error("All values are 0 — enter your actual metrics before saving.")
            else:
                with open(external_metrics_path, "w") as f:
                    json.dump({
                        "accuracy": accuracy / 100, "precision": precision / 100,
                        "recall": recall / 100, "f1_score": f1 / 100,
                    }, f, indent=2)
                st.success("Saved!")
                st.rerun()

    if has_real_metrics:
        if st.button("🗑️ Clear saved metrics"):
            external_metrics_path.unlink(missing_ok=True)
            st.rerun()


def _render_feature_performance():
    from ml_models.predictor import get_feature_predictor

    predictor = get_feature_predictor()
    metrics = predictor.get_metrics()

    if not metrics:
        st.warning("No trained models found yet. Train models first "
                   "(`python -m ml_models.train_pipeline` or Admin Panel → Retrain Models).")
        return

    summary_rows = []
    for model_name, m in metrics.items():
        summary_rows.append({
            "Model": model_name.replace("_", " ").title(),
            "Accuracy": f"{m['accuracy']*100:.2f}%",
            "Precision": f"{m['precision']*100:.2f}%",
            "Recall": f"{m['recall']*100:.2f}%",
            "F1 Score": f"{m['f1_score']*100:.2f}%",
            "ROC AUC": f"{m['roc_curve']['auc']:.3f}",
            "Train Time (s)": f"{m.get('train_time_sec', 0):.2f}",
        })
    st.subheader("Summary")
    st.dataframe(pd.DataFrame(summary_rows), use_container_width=True, hide_index=True)

    st.divider()
    model_tabs = st.tabs([m.replace("_", " ").title() for m in metrics.keys()])
    for tab, (model_name, m) in zip(model_tabs, metrics.items()):
        with tab:
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Accuracy", f"{m['accuracy']*100:.2f}%")
            c2.metric("Precision", f"{m['precision']*100:.2f}%")
            c3.metric("Recall", f"{m['recall']*100:.2f}%")
            c4.metric("F1 Score", f"{m['f1_score']*100:.2f}%")

            col1, col2 = st.columns(2)
            with col1:
                st.markdown("**Confusion Matrix**")
                cm = np.array(m["confusion_matrix"])
                cm_df = pd.DataFrame(
                    cm, index=["Actual: Forged", "Actual: Genuine"],
                    columns=["Predicted: Forged", "Predicted: Genuine"],
                )
                st.dataframe(cm_df, use_container_width=True)

            with col2:
                st.markdown(f"**ROC Curve (AUC = {m['roc_curve']['auc']:.3f})**")
                roc_df = pd.DataFrame({
                    "False Positive Rate": m["roc_curve"]["fpr"],
                    "True Positive Rate": m["roc_curve"]["tpr"],
                })
                st.line_chart(roc_df, x="False Positive Rate", y="True Positive Rate")
