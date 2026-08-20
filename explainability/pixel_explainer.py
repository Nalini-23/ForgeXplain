"""
pixel_explainer.py
---------------------
Explainability for the pixel-based Random Forest model.

Unlike the engineered-feature model (where SHAP values attach to named,
human-readable features like "area" or "aspect_ratio"), this model's
49,152 "features" are just raw pixel intensities. A list of the top pixel
indices would mean nothing to a person, so instead we compute per-pixel
SHAP attributions with TreeExplainer, collapse the 3 color channels down
to one importance value per pixel, and render it as a heatmap overlaid on
the original signature image — literally highlighting which strokes/
regions drove the Genuine-vs-Forged decision.
"""

import io
import numpy as np
import streamlit as st
import matplotlib.pyplot as plt
import matplotlib.cm as cm
from typing import Dict, Any
from utils.logger import get_logger

logger = get_logger(__name__)


@st.cache_resource(show_spinner=False)
def _get_tree_explainer(_model):
    """
    Cached SHAP TreeExplainer. Building this walks every tree in the random
    forest, which is not free — without caching it happened on every single
    prediction. The leading underscore on _model tells Streamlit not to
    hash that argument (sklearn models aren't reliably hashable anyway);
    since there's one pixel model for the app's lifetime, this is
    effectively a one-time cost.
    """
    import shap
    return shap.TreeExplainer(_model)


class PixelExplainer:
    def explain(self, model, flat_features: np.ndarray, image_array: np.ndarray,
                image_size=(128, 128)) -> Dict[str, Any]:
        """
        flat_features: (1, 49152) — the exact input the model was predicted on
        image_array:   (128, 128, 3) float32 in [0,1] — for overlay rendering
        Returns a dict with a heatmap-overlay image (as bytes, PNG), a
        confidence comparison chart, a quadrant-importance chart, and a
        plain-language summary. Falls back gracefully if SHAP errors out.
        """
        proba = None
        try:
            proba = model.predict_proba(flat_features)[0]
        except Exception:
            pass

        try:
            result = self._explain_with_shap(model, flat_features, image_array, image_size)
        except Exception as e:
            logger.warning("Pixel SHAP explanation failed: %s", e)
            result = self._fallback(image_array)

        result["confidence_chart_png"] = self._render_confidence_chart(proba) if proba is not None else None

        try:
            stroke_metrics = self.compute_stroke_metrics(image_array)
            result["stroke_metrics"] = stroke_metrics
            result["comparison_chart_png"] = self._render_comparison_chart(stroke_metrics)
        except Exception as e:
            logger.warning("Stroke comparison metrics failed: %s", e)
            result["stroke_metrics"] = None
            result["comparison_chart_png"] = None

        return result

    # ---- Stroke-characteristic comparison (genuine vs forged patterns) --------
    def compute_stroke_metrics(self, image_array: np.ndarray) -> Dict[str, float]:
        """
        Computes two general, well-established signature-analysis measures
        directly from the image (independent of the model):

          - stroke smoothness:   genuine signatures are usually written fast
                                   and fluidly -> smoother, simpler stroke
                                   outlines. Forged/copied signatures are
                                   often drawn slowly -> jagged, tremor-y
                                   outlines.
          - stroke consistency:  genuine signatures tend to have fairly
                                   even pen pressure/width throughout.
                                   Forgeries (copied/traced) often show
                                   more variable stroke width from
                                   hesitation.

        Both are returned as 0-100 scores (higher = more "genuine-like"
        by these two general heuristics) purely for illustrative
        comparison — they are not what the model itself bases its
        decision on (that's the SHAP heatmap above).
        """
        import cv2
        gray = cv2.cvtColor((image_array * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            all_pts = np.vstack(contours)
            hull = cv2.convexHull(all_pts)
            hull_perimeter = cv2.arcLength(hull, True)
            total_perimeter = sum(cv2.arcLength(c, True) for c in contours) or 1.0
            smoothness = min(100.0, (hull_perimeter / total_perimeter) * 140)
        else:
            smoothness = 0.0

        dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
        stroke_widths = dist[binary > 0]
        if stroke_widths.size > 0:
            width_std = float(np.std(stroke_widths))
            consistency = max(0.0, 100.0 - min(width_std, 5.0) / 5.0 * 100.0)
        else:
            consistency = 0.0

        return {
            "stroke_smoothness": round(smoothness, 1),
            "stroke_consistency": round(consistency, 1),
        }

    def _render_comparison_chart(self, this_signature: Dict[str, float]) -> bytes:
        """Grouped bar chart: this signature vs typical genuine/forged reference ranges."""
        # Illustrative reference midpoints from general signature-forensics
        # characteristics (genuine = smoother + more consistent strokes;
        # forged/copied = more jagged + more variable strokes).
        typical_genuine = {"stroke_smoothness": 78, "stroke_consistency": 75}
        typical_forged = {"stroke_smoothness": 42, "stroke_consistency": 40}

        metrics = ["stroke_smoothness", "stroke_consistency"]
        labels = ["Stroke Smoothness", "Stroke Consistency"]
        x = np.arange(len(metrics))
        width = 0.25

        fig, ax = plt.subplots(figsize=(7, 3.2))
        ax.bar(x - width, [typical_forged[m] for m in metrics], width,
               label="Typical Forged Pattern", color="#FCA5A5")
        ax.bar(x, [this_signature[m] for m in metrics], width,
               label="This Signature", color="#6366F1")
        ax.bar(x + width, [typical_genuine[m] for m in metrics], width,
               label="Typical Genuine Pattern", color="#86EFAC")

        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.set_ylabel("Score (0-100)")
        ax.set_ylim(0, 110)
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=3, frameon=False, fontsize=8)
        ax.spines[["top", "right"]].set_visible(False)
        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    def _explain_with_shap(self, model, flat_features, image_array, image_size):
        import shap

        explainer = _get_tree_explainer(model)
        shap_values_raw = explainer.shap_values(flat_features)

        # Normalize across the various shapes TreeExplainer can return for
        # binary classifiers depending on shap/sklearn version.
        if isinstance(shap_values_raw, list):
            shap_values = np.array(shap_values_raw[1]).flatten()  # class 1 = "original"/Genuine
        elif isinstance(shap_values_raw, np.ndarray) and shap_values_raw.ndim == 3:
            shap_values = shap_values_raw[0, :, 1]
        else:
            shap_values = np.array(shap_values_raw).flatten()

        w, h = image_size
        # Reshape back to (H, W, 3) matching the original flatten order, then
        # collapse channels by summing absolute contribution per pixel.
        pixel_shap = shap_values.reshape(h, w, 3)
        pixel_importance = np.sum(np.abs(pixel_shap), axis=2)  # (H, W)

        heatmap_png = self._render_overlay(image_array, pixel_importance)

        # Region-based breakdown: which quadrant of the signature dominated
        # the decision — shown both as text and as a bar chart, since a
        # chart makes "why" concrete rather than just asserted in a sentence.
        quadrant_scores = self._compute_quadrant_scores(pixel_importance)
        region_summary = max(quadrant_scores, key=quadrant_scores.get)
        quadrant_chart_png = self._render_quadrant_chart(quadrant_scores)

        signed_pixel_shap = np.sum(pixel_shap, axis=2)  # keep sign for direction
        net_direction = "Genuine" if np.sum(signed_pixel_shap) > 0 else "Forged"

        plain_language = (
            f"The strongest visual evidence for this decision came from the {region_summary} "
            f"of the signature, where stroke patterns most strongly pushed the prediction "
            f"toward **{net_direction}**. The heatmap below highlights exactly which regions "
            f"contributed most — warmer colors (red/yellow) mark higher-influence areas."
        )

        return {
            "backend": "shap",
            "heatmap_png": heatmap_png,
            "plain_language": plain_language,
            "dominant_region": region_summary,
            "pixel_importance": pixel_importance,
            "quadrant_scores": quadrant_scores,
            "quadrant_chart_png": quadrant_chart_png,
        }

    def _render_overlay(self, image_array: np.ndarray, pixel_importance: np.ndarray) -> bytes:
        """Renders original image + semi-transparent 'jet' heatmap overlay as a PNG."""
        norm_importance = pixel_importance - pixel_importance.min()
        max_val = norm_importance.max()
        if max_val > 0:
            norm_importance = norm_importance / max_val

        fig, axes = plt.subplots(1, 3, figsize=(12, 4.2))

        axes[0].imshow(image_array)
        axes[0].set_title("Original Signature")
        axes[0].axis("off")

        axes[1].imshow(norm_importance, cmap="turbo")
        axes[1].set_title("Pixel Importance (SHAP)")
        axes[1].axis("off")

        axes[2].imshow(image_array)
        axes[2].imshow(norm_importance, cmap="turbo", alpha=0.5)
        axes[2].set_title("Overlay")
        axes[2].axis("off")

        plt.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    @staticmethod
    def _compute_quadrant_scores(pixel_importance: np.ndarray) -> Dict[str, float]:
        """Returns each quadrant's share of total importance, as a percentage (sums to 100)."""
        h, w = pixel_importance.shape
        mid_h, mid_w = h // 2, w // 2

        raw = {
            "top-left": float(pixel_importance[:mid_h, :mid_w].sum()),
            "top-right": float(pixel_importance[:mid_h, mid_w:].sum()),
            "bottom-left": float(pixel_importance[mid_h:, :mid_w].sum()),
            "bottom-right": float(pixel_importance[mid_h:, mid_w:].sum()),
        }
        total = sum(raw.values()) or 1.0
        return {k: round(v / total * 100, 1) for k, v in raw.items()}

    def _render_quadrant_chart(self, quadrant_scores: Dict[str, float]) -> bytes:
        """Simple horizontal bar chart showing which part of the signature mattered most."""
        labels = list(quadrant_scores.keys())
        values = list(quadrant_scores.values())
        palette = ["#6366F1", "#EC4899", "#F59E0B", "#10B981"]  # indigo, pink, amber, emerald
        colors = [palette[i % len(palette)] for i in range(len(labels))]

        fig, ax = plt.subplots(figsize=(6, 2.8))
        bars = ax.barh(labels, values, color=colors)
        for bar, v in zip(bars, values):
            ax.text(v + 1, bar.get_y() + bar.get_height() / 2, f"{v}%",
                    va="center", fontsize=9, color="#334155", fontweight="bold")
        ax.set_xlabel("Share of total influence (%)")
        ax.set_xlim(0, max(values) + 15)
        ax.spines[["top", "right"]].set_visible(False)
        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    def _render_confidence_chart(self, proba: np.ndarray) -> bytes:
        """Simple bar comparing Forged vs Genuine probability — makes 'how sure' visual."""
        labels = ["Forged", "Genuine"]
        values = [round(float(proba[0]) * 100, 1), round(float(proba[1]) * 100, 1)]
        colors = ["#EF4444" if v == max(values) else "#FCA5A5" for v in [values[0]]] + \
                  ["#22C55E" if values[1] == max(values) else "#86EFAC"]

        fig, ax = plt.subplots(figsize=(6, 2.2))
        bars = ax.barh(labels, values, color=colors)
        for bar, v in zip(bars, values):
            ax.text(v + 1, bar.get_y() + bar.get_height() / 2, f"{v}%",
                    va="center", fontsize=9, color="#334155")
        ax.set_xlim(0, 110)
        ax.set_xlabel("Model confidence (%)")
        ax.spines[["top", "right"]].set_visible(False)
        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    def _fallback(self, image_array: np.ndarray) -> Dict[str, Any]:
        fig, ax = plt.subplots(figsize=(4, 4))
        ax.imshow(image_array)
        ax.set_title("Original Signature")
        ax.axis("off")
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return {
            "backend": "none",
            "heatmap_png": buf.getvalue(),
            "plain_language": "Pixel-level explanation is temporarily unavailable for this prediction.",
            "dominant_region": None,
            "pixel_importance": None,
            "quadrant_scores": None,
            "quadrant_chart_png": None,
        }
