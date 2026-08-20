"""
explainer.py
-------------
Explainable AI layer. Tries SHAP first (TreeExplainer for Random Forest,
KernelExplainer for SVM); if the shap package is unavailable or errors out,
automatically falls back to LIME's tabular explainer. Either way, the
caller gets back a backend-agnostic dict so the UI code never branches on
which library actually ran.
"""

import numpy as np
import pandas as pd
import streamlit as st
from typing import Dict, Any, List

from features.feature_extractor import FEATURE_NAMES
from utils.config import SHAP_BACKGROUND_SAMPLES, SHAP_BACKGROUND_PATH
from utils.logger import get_logger

logger = get_logger(__name__)


@st.cache_resource(show_spinner=False)
def _get_tree_explainer(_model):
    """Cached SHAP TreeExplainer — see pixel_explainer.py for rationale."""
    import shap
    return shap.TreeExplainer(_model)


@st.cache_resource(show_spinner=False)
def _get_real_background():
    """
    Loads the real, scaled training-data sample saved by train_pipeline.py.
    Cached so it's read from disk once per app run, not once per prediction.
    Returns None if a model was trained before this fix and the file doesn't
    exist yet (caller falls back gracefully, see below).
    """
    if SHAP_BACKGROUND_PATH.exists():
        return np.load(SHAP_BACKGROUND_PATH)
    logger.warning(
        "shap_background.npy not found — retrain via `python -m "
        "ml_models.train_pipeline` to enable a proper SHAP background for SVM."
    )
    return None


@st.cache_resource(show_spinner=False)
def _get_kernel_explainer(_model, background_key: str):
    """
    Cached SHAP KernelExplainer for SVM, keyed on the model identity + which
    background was used. Previously this (plus the expensive shap.kmeans
    summarization) was rebuilt from scratch on every single prediction —
    that was the main cause of slow explanations. Now it's built once and
    reused for the rest of the session.
    """
    import shap
    bg = _get_real_background()
    if bg is None:
        bg = np.zeros((1, len(FEATURE_NAMES)))  # last-resort neutral background
    bg_summary = shap.kmeans(bg, min(SHAP_BACKGROUND_SAMPLES, len(bg)))
    return shap.KernelExplainer(_model.predict_proba, bg_summary)


class Explainer:
    def __init__(self):
        self.backend_used = None

    def explain(self, model, model_name: str, scaler, X_scaled: np.ndarray,
                background_data: np.ndarray = None) -> Dict[str, Any]:
        """
        Returns:
            {
              "backend": "shap" | "lime",
              "feature_importance": {feature_name: signed_contribution, ...},
              "top_features": [(name, value), ...]  sorted by |contribution|,
              "plain_language": "...",
              "shap_values": np.ndarray or None,   # for summary/waterfall plots
              "base_value": float or None,
            }
        """
        try:
            result = self._explain_with_shap(model, model_name, X_scaled, background_data)
            self.backend_used = "shap"
            return result
        except Exception as e:
            logger.warning("SHAP explanation failed (%s) — falling back to LIME.", e)
            try:
                result = self._explain_with_lime(model, X_scaled, background_data)
                self.backend_used = "lime"
                return result
            except Exception as e2:
                logger.error("LIME fallback also failed: %s", e2)
                return self._fallback_no_xai(X_scaled)

    # ---- SHAP ---------------------------------------------------------------
    def _explain_with_shap(self, model, model_name, X_scaled, background_data):
        import shap

        if model_name == "random_forest":
            explainer = _get_tree_explainer(model)
            shap_values_raw = explainer.shap_values(X_scaled)
            # sklearn RF binary classification -> list [class0, class1] or (n,features,2)
            if isinstance(shap_values_raw, list):
                shap_values = shap_values_raw[1][0]
                base_value = explainer.expected_value[1]
            elif isinstance(shap_values_raw, np.ndarray) and shap_values_raw.ndim == 3:
                shap_values = shap_values_raw[0, :, 1]
                base_value = explainer.expected_value[1] if hasattr(explainer.expected_value, "__len__") else explainer.expected_value
            else:
                shap_values = shap_values_raw[0]
                base_value = explainer.expected_value
        else:
            # Use caller-supplied background if given; otherwise fall back to the
            # real cached training-data background (see _get_real_background),
            # never the query point itself — explaining a point relative only to
            # itself is degenerate and was the second bug here.
            if background_data is not None:
                bg_summary = shap.kmeans(background_data, min(SHAP_BACKGROUND_SAMPLES, len(background_data)))
                explainer = shap.KernelExplainer(model.predict_proba, bg_summary)
            else:
                explainer = _get_kernel_explainer(model, background_key="real_training_sample")
            shap_values_raw = explainer.shap_values(X_scaled, nsamples=100)
            shap_values = shap_values_raw[1][0] if isinstance(shap_values_raw, list) else shap_values_raw[0]
            base_value = explainer.expected_value[1] if hasattr(explainer.expected_value, "__len__") else explainer.expected_value

        shap_values = np.array(shap_values).flatten()
        feature_importance = dict(zip(FEATURE_NAMES, shap_values.tolist()))
        top_features = sorted(feature_importance.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5]

        return {
            "backend": "shap",
            "feature_importance": feature_importance,
            "top_features": top_features,
            "plain_language": self._plain_language_summary(top_features),
            "shap_values": shap_values,
            "base_value": float(base_value) if base_value is not None else None,
        }

    # ---- LIME fallback --------------------------------------------------------
    def _explain_with_lime(self, model, X_scaled, background_data):
        from lime.lime_tabular import LimeTabularExplainer

        training_data = background_data if background_data is not None else np.repeat(X_scaled, 20, axis=0)
        explainer = LimeTabularExplainer(
            training_data=training_data,
            feature_names=FEATURE_NAMES,
            class_names=["Forged", "Genuine"],
            mode="classification",
            discretize_continuous=True,
        )
        exp = explainer.explain_instance(
            X_scaled[0], model.predict_proba, num_features=len(FEATURE_NAMES)
        )
        feature_importance = dict(exp.as_list())
        # LIME keys look like "feature <= 0.5" — map back to plain names best-effort
        clean_importance = {}
        for k, v in feature_importance.items():
            matched = next((f for f in FEATURE_NAMES if f in k), k)
            clean_importance[matched] = v

        top_features = sorted(clean_importance.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5]

        return {
            "backend": "lime",
            "feature_importance": clean_importance,
            "top_features": top_features,
            "plain_language": self._plain_language_summary(top_features),
            "shap_values": None,
            "base_value": None,
        }

    def _fallback_no_xai(self, X_scaled):
        return {
            "backend": "none",
            "feature_importance": {},
            "top_features": [],
            "plain_language": "Explainability is temporarily unavailable for this prediction.",
            "shap_values": None,
            "base_value": None,
        }

    @staticmethod
    def _plain_language_summary(top_features: List[tuple]) -> str:
        if not top_features:
            return "No dominant features were identified for this prediction."

        readable = {
            "area": "signature stroke area", "perimeter": "stroke perimeter length",
            "aspect_ratio": "width-to-height ratio", "bbox_width": "signature width",
            "bbox_height": "signature height", "pixel_density": "ink density",
            "black_white_ratio": "background-to-ink ratio", "num_contours": "number of stroke segments",
            "avg_contour_area": "average stroke segment size", "solidity": "stroke shape solidity",
        }
        for i in range(1, 8):
            readable[f"hu_moment_{i}"] = f"shape descriptor #{i} (Hu moment)"
        for i in range(1, 7):
            readable[f"hist_bin_{i}"] = f"intensity distribution (bin {i})"

        parts = []
        for name, value in top_features[:3]:
            direction = "pushed the prediction toward Genuine" if value > 0 else "pushed the prediction toward Forged"
            label = readable.get(name, name)
            parts.append(f"the {label} {direction}")

        return "This prediction was primarily driven by: " + "; ".join(parts) + "."
