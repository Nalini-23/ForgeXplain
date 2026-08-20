"""
page_detection.py
--------------------
Core prediction workflow page.

ACTIVE_ENGINE = "pixel" (default, see utils/config.py) uses the externally
-trained pixel-based Random Forest (random_forest_model.joblib +
label_encoder.joblib) with SHAP pixel-heatmap explainability.

ACTIVE_ENGINE = "features" falls back to the in-app engineered-feature
pipeline (OpenCV preprocessing -> 23 features -> SVM/RF -> SHAP/LIME),
useful if you retrain on CEDAR later and want named-feature explanations
instead of pixel heatmaps.
"""

import streamlit as st
import cv2
import numpy as np

from utils.config import ACTIVE_ENGINE
from utils.pdf_report import generate_prediction_report
from utils.logger import get_logger
from utils.ui_helpers import render_page_header, render_risk_gauge, render_result_banner

logger = get_logger(__name__)


def render():
    render_page_header("🔍", "Signature Detection",
                        "Upload a handwritten signature to check whether it's genuine or forged.")

    if ACTIVE_ENGINE == "pixel":
        _render_pixel_engine()
    else:
        _render_feature_engine()


# ============================================================================
# PIXEL-BASED ENGINE (default — uses your trained random_forest_model.joblib)
# ============================================================================
def _render_pixel_engine():
    from ml_models.pixel_predictor import get_pixel_predictor, PixelModelNotFoundError
    from explainability.pixel_explainer import PixelExplainer
    from preprocessing.signature_detector import SignatureDetector
    from preprocessing.image_processor import ImageProcessor
    from streamlit_cropper import st_cropper
    from PIL import Image as PILImage
    from database.db_interface import get_db

    uploaded_file = st.file_uploader("Upload signature image", type=["png", "jpg", "jpeg", "bmp", "tiff"])
    st.caption("You can upload a tight signature scan, or a full document/cheque photo — "
               "on full documents, the signature region is auto-detected and you'll get a "
               "chance to confirm or adjust it before anything is analyzed.")
    if not uploaded_file:
        st.info("👆 Upload a signature image (PNG/JPG/BMP) to get started.")
        return

    file_bytes = uploaded_file.read()

    # Reset confirmed crop when a new file is uploaded — it shouldn't carry
    # over to a different image.
    if st.session_state.get("_last_uploaded_file_id") != uploaded_file.file_id:
        st.session_state["confirmed_crop"] = None
        st.session_state["_last_uploaded_file_id"] = uploaded_file.file_id

    try:
        full_image = ImageProcessor.load_image_from_bytes(file_bytes)
    except ValueError as e:
        st.error(str(e))
        return

    detector = SignatureDetector()
    cropped_image, was_cropped, box = detector.detect_and_crop_with_box(full_image)

    if not was_cropped:
        # Looks like a tight signature-only scan already (or detection found
        # nothing worth cropping) — go straight to analysis, no extra step.
        final_image = cropped_image
    elif st.session_state.get("confirmed_crop") is not None:
        # User already confirmed/adjusted a crop for this exact upload.
        final_image = st.session_state["confirmed_crop"]
        st.success("✅ Using your confirmed signature region.")
        st.image(cv2.cvtColor(final_image, cv2.COLOR_BGR2RGB), caption="Region used for analysis", width=320)
        if st.button("↩️ Re-adjust crop"):
            st.session_state["confirmed_crop"] = None
            st.rerun()
    else:
        # Document/cheque detected — never silently trust the auto-crop.
        # Show it as an editable, pre-filled box and require confirmation
        # before any prediction runs.
        st.info("📄 This looks like a full document, not just a signature. "
                "The box below is our best guess at the signature region — "
                "**drag its edges to fix it** if it's grabbing a date, printed "
                "text, or the wrong area, then confirm.")
        full_pil = PILImage.fromarray(cv2.cvtColor(full_image, cv2.COLOR_BGR2RGB))
        # st_cropper's default_coords expects (left, right, top, bottom) —
        # NOT (left, top, right, bottom). Our detector returns the latter,
        # so reorder here before handing it off.
        default_coords = (box[0], box[2], box[1], box[3]) if box else None
        cropped_pil = st_cropper(full_pil, realtime_update=True, box_color="#A855F7",
                                  aspect_ratio=None, default_coords=default_coords, key="sig_cropper")
        if st.button("✅ Confirm this region & analyze", type="primary"):
            st.session_state["confirmed_crop"] = cv2.cvtColor(np.array(cropped_pil), cv2.COLOR_RGB2BGR)
            st.rerun()
        st.stop()

    ok, buf = cv2.imencode(".png", final_image)
    file_bytes_for_model = buf.tobytes() if ok else file_bytes

    try:
        predictor = get_pixel_predictor()
    except PixelModelNotFoundError as e:
        st.error(str(e))
        return

    with st.spinner("Analyzing signature..."):
        try:
            result = predictor.predict(file_bytes_for_model)
        except Exception as e:
            st.error(f"Prediction failed: {e}")
            logger.error("Pixel prediction error: %s", e)
            return

    st.subheader("Analysis Result")
    is_forged = result["prediction"] != "Genuine"
    render_result_banner(is_forged, result["confidence"])

    col_gauge, col_stats = st.columns([1, 1.4])
    with col_gauge:
        render_risk_gauge(
            percent=result["confidence"] if is_forged else 100 - result["confidence"],
            label="Risk Score" if is_forged else "Genuine Score",
            danger=is_forged,
        )
        st.image(result["image_array"], caption="Model input (128×128)", width=180)
    with col_stats:
        c1, c2 = st.columns(2)
        c1.metric("Prediction", result["prediction"])
        c2.metric("Confidence", f"{result['confidence']}%")
        c3, c4 = st.columns(2)
        c3.metric("Model Used", "Random Forest")
        c4.metric("Prediction Time", f"{result['prediction_time_ms']} ms")
        with st.expander("Class probabilities"):
            st.json(result["class_probabilities"])

    st.divider()
    st.subheader("🧠 Why this decision?")
    with st.spinner("Generating pixel-level explanation (SHAP)..."):
        try:
            explainer = PixelExplainer()
            explanation = explainer.explain(
                model=predictor.get_model(),
                flat_features=result["flat_features"],
                image_array=result["image_array"],
            )
        except Exception as e:
            logger.error("Pixel explanation failed: %s", e)
            explanation = {"plain_language": "Explanation unavailable.", "heatmap_png": None, "backend": "none"}

    st.info(explanation["plain_language"])
    if explanation.get("heatmap_png"):
        st.image(explanation["heatmap_png"], caption="Original · Pixel Importance · Overlay",
                  use_container_width=True)
    st.caption(f"Explanation backend: {explanation['backend'].upper()}")

    st.session_state["last_pixel_prediction"] = result
    st.session_state["last_pixel_explanation"] = explanation

    # ---- Save to history --------------------------------------------------
    db = get_db()
    record = {
        "user_id": st.session_state.user_id,
        "image_filename": uploaded_file.name,
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "model_used": result["model_used"],
        "prediction_time_ms": result["prediction_time_ms"],
        "features": {"class_probabilities": result["class_probabilities"]},
        "explanation_summary": explanation["plain_language"],
    }
    db.save_prediction(record)
    st.toast("Prediction saved to your history.", icon="✅")

    # ---- PDF report ---------------------------------------------------------
    original_bgr = cv2.cvtColor((result["image_array"] * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    report_result = {
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "model_used": result["model_used"],
        "prediction_time_ms": result["prediction_time_ms"],
        "explanation_summary": explanation["plain_language"],
        "top_features": [],  # not applicable for pixel-based model
    }
    pdf_bytes = generate_prediction_report(
        report_result, original_bgr, st.session_state.user.get("email", "user")
    )
    st.download_button(
        "📄 Download PDF Report", data=pdf_bytes,
        file_name=f"forgexplain_report_{uploaded_file.name}.pdf",
        mime="application/pdf", use_container_width=True,
    )


# ============================================================================
# WRITER-DEPENDENT VERIFICATION (compare against a registered signer)
# ============================================================================
def _render_signer_verification():
    from ml_models.predictor import get_feature_predictor, ModelNotTrainedError
    from verification.signer_verifier import SignerVerifier
    from utils.crop_helper import resolve_signature_region
    from database.db_interface import get_db

    db = get_db()
    signers = db.list_signers()

    if not signers:
        st.warning("No signers are registered yet. Ask an Admin to register a person's "
                   "reference signature first, from **Admin Panel → 🖊️ Registered Signers**.")
        return

    st.caption("Compares an uploaded signature against a specific registered person's "
               "reference signature on file — the way a bank verifies a cheque against "
               "the signature card, rather than judging genuineness in the abstract.")

    names = [s["name"] for s in signers]
    selected_name = st.selectbox("Check against", names)

    uploaded_file = st.file_uploader("Upload signature to verify", type=["png", "jpg", "jpeg", "bmp", "tiff"],
                                      key="verify_upload")
    if not uploaded_file:
        st.info("👆 Upload the signature you want to check against the selected person's record.")
        return

    file_bytes = uploaded_file.read()
    try:
        resolved = resolve_signature_region(file_bytes, widget_key="verify", file_id=uploaded_file.file_id)
    except ValueError as e:
        st.error(str(e))
        return
    if resolved is None:
        st.stop()
    image, _was_cropped = resolved

    try:
        predictor = get_feature_predictor()
        scaler = predictor.get_scaler()
    except ModelNotTrainedError as e:
        st.error(str(e))
        return

    signer_record = db.get_signer_by_name(selected_name)
    verifier = SignerVerifier(scaler=scaler)
    template_vec = np.array(signer_record["feature_vector"])

    with st.spinner("Comparing against registered signature..."):
        result = verifier.verify(template_vec, image)

    st.subheader("Verification Result")
    render_result_banner(not result["is_match"], result["similarity"])

    col_gauge, col_stats = st.columns([1, 1.4])
    with col_gauge:
        render_risk_gauge(
            percent=result["similarity"],
            label="Match Score",
            danger=not result["is_match"],
        )
    with col_stats:
        c1, c2 = st.columns(2)
        c1.metric("Compared against", selected_name)
        c2.metric("Match score", f"{result['similarity']}%")
        c3, c4 = st.columns(2)
        c3.metric("Verdict", "✅ Match" if result["is_match"] else "❌ No match")
        c4.metric("Match threshold", f"{result['threshold']}%")
        st.caption(
            f"Compared against {signer_record['num_samples']} reference sample(s) "
            f"registered for {selected_name}. Threshold calibrated to separate a person's "
            "own natural signature variation from a different person's signature."
        )

    db.save_prediction({
        "user_id": st.session_state.user_id,
        "image_filename": uploaded_file.name,
        "prediction": result["verdict"],
        "confidence": result["similarity"],
        "model_used": f"writer_dependent ({selected_name})",
        "prediction_time_ms": 0,
        "features": {"similarity": result["similarity"], "threshold": result["threshold"]},
        "explanation_summary": f"Compared against {selected_name}'s registered signature.",
    })
    st.toast("Verification saved to your history.", icon="✅")


# ============================================================================
# ENGINEERED-FEATURE ENGINE (fallback — 23 features, SVM/RF, SHAP/LIME)
# ============================================================================
def _render_feature_engine():
    from preprocessing.image_processor import ImageProcessor
    from ml_models.predictor import get_feature_predictor, ModelNotTrainedError
    from explainability.explainer import Explainer
    from database.db_interface import get_db
    from utils.crop_helper import resolve_signature_region
    import matplotlib.pyplot as plt

    mode = st.radio(
        "Check mode",
        ["🔍 Generic Check", "🖊️ Verify Against Registered Signer"],
        horizontal=True,
        help="Generic Check judges whether a signature looks genuine in general. "
             "Verify Against Registered Signer compares it against a specific "
             "person's signature on file — the way a bank verifies a cheque.",
    )
    if mode == "🖊️ Verify Against Registered Signer":
        _render_signer_verification()
        return

    col_upload, col_settings = st.columns([2, 1])
    with col_upload:
        uploaded_file = st.file_uploader("Upload signature image", type=["png", "jpg", "jpeg", "bmp", "tiff"])
    with col_settings:
        st.caption("Both SVM and Random Forest run together automatically — "
                   "see them compared side by side below, instead of switching models one at a time. "
                   "You can upload a tight signature scan, or a full document/cheque photo.")

    if not uploaded_file:
        st.info("👆 Upload a signature image (PNG/JPG/BMP) to get started.")
        return

    file_bytes = uploaded_file.read()

    try:
        resolved = resolve_signature_region(file_bytes, widget_key="detect", file_id=uploaded_file.file_id)
    except ValueError as e:
        st.error(str(e))
        return
    if resolved is None:
        st.stop()
    image, _was_cropped = resolved

    with st.spinner("Preprocessing image..."):
        processor = ImageProcessor()
        stages = processor.process(image)

    st.subheader("Preprocessing")
    tab1, tab2 = st.tabs(["Original vs Processed", "Full Pipeline"])
    with tab1:
        c1, c2 = st.columns(2)
        c1.image(cv2.cvtColor(stages["original"], cv2.COLOR_BGR2RGB), caption="Original", use_container_width=True)
        c2.image(stages["normalized"], caption="Processed (normalized)", use_container_width=True)
    with tab2:
        cols = st.columns(3)
        stage_items = [(k, v) for k, v in stages.items() if k != "original"]
        for i, (name, img) in enumerate(stage_items):
            with cols[i % 3]:
                display_img = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                st.image(display_img, caption=name.replace("_", " ").title(), use_container_width=True)

    st.divider()

    if st.button("🚀 Run Prediction", type="primary", use_container_width=True):
        try:
            predictor = get_feature_predictor()
            with st.spinner("Running prediction..."):
                results = {
                    model_name: predictor.predict(image, model_name=model_name)
                    for model_name in ["svm", "random_forest"]
                }
        except ModelNotTrainedError as e:
            st.error(str(e))
            st.info("Admins can train models from the Admin Panel, or run: "
                    "`python -m ml_models.train_pipeline`")
            return

        # ---- Combine into ONE verdict (ensemble) ------------------------------
        # Previously SVM and Random Forest were shown as two separate results,
        # which was confusing when they disagreed. Now they're combined into a
        # single soft-voted verdict — the two models' probability estimates are
        # averaged into one number, giving one prediction and one confidence,
        # the way a real combined system should behave.
        avg_proba_genuine = (results["svm"]["proba_genuine"] + results["random_forest"]["proba_genuine"]) / 2
        is_forged = avg_proba_genuine < 0.5
        ensemble_confidence = round((1 - avg_proba_genuine if is_forged else avg_proba_genuine) * 100, 1)
        ensemble_verdict = "Forged" if is_forged else "Genuine"
        models_agree = results["svm"]["prediction"] == results["random_forest"]["prediction"]

        st.session_state["last_prediction"] = results["random_forest"]
        st.session_state["last_image"] = image

        st.subheader("Analysis Result")
        render_result_banner(is_forged, ensemble_confidence)

        col_gauge, col_stats = st.columns([1, 1.4])
        with col_gauge:
            render_risk_gauge(
                percent=ensemble_confidence if is_forged else ensemble_confidence,
                label="Risk Score" if is_forged else "Genuine Score",
                danger=is_forged,
            )
        with col_stats:
            c1, c2 = st.columns(2)
            c1.metric("Prediction", ensemble_verdict)
            c2.metric("Confidence", f"{ensemble_confidence}%")
            st.caption(
                "Combined from both SVM and Random Forest working together "
                f"(SVM: {results['svm']['confidence']}% {results['svm']['prediction']}, "
                f"Random Forest: {results['random_forest']['confidence']}% {results['random_forest']['prediction']})."
            )
            if not models_agree:
                st.caption(
                    "⚠️ The two models leaned different ways on this one — the combined "
                    "score above already accounts for that, but treat a close result "
                    "like this as worth a second, manual look."
                )

        st.divider()

        # ---- Explanation: one fast, clear explanation for the combined result ------
        # Generating a full SHAP explanation for BOTH models on every upload was
        # the main cause of slowness. Now only one explanation is generated (from
        # Random Forest — it's the more accurate model and its explainer is exact
        # and fast, not the slower simulation-based one SVM needs), which reflects
        # the same features that drove the combined verdict above.
        st.subheader("🧠 Why this decision?")
        with st.spinner("Generating explanation..."):
            explainer = Explainer()
            try:
                explanation = explainer.explain(
                    model=predictor.get_model("random_forest"),
                    model_name="random_forest",
                    scaler=predictor.get_scaler(),
                    X_scaled=results["random_forest"]["feature_vector_scaled"],
                )
            except Exception as e:
                logger.error("Explanation generation failed: %s", e)
                explanation = {"plain_language": "Explanation unavailable.", "top_features": [], "backend": "none"}
        st.session_state["last_explanation"] = explanation

        st.info(explanation["plain_language"])

        top = explanation.get("top_features", [])
        if top:
            readable = {
                "area": "Signature stroke area", "perimeter": "Stroke perimeter length",
                "aspect_ratio": "Width-to-height ratio", "bbox_width": "Signature width",
                "bbox_height": "Signature height", "pixel_density": "Ink density",
                "black_white_ratio": "Background-to-ink ratio", "num_contours": "Number of stroke segments",
                "avg_contour_area": "Average stroke segment size", "solidity": "Stroke shape solidity",
            }
            for i in range(1, 8):
                readable[f"hu_moment_{i}"] = f"Shape descriptor #{i}"
            for i in range(1, 7):
                readable[f"hist_bin_{i}"] = f"Ink pattern (region {i})"

            col_bar, col_donut = st.columns([1.5, 1])

            with col_bar:
                # Bar chart with plain-English names, value labels, and a legend
                # caption — the old version showed raw feature codes like
                # "hist_bin_2" with no explanation of what direction meant.
                names = [readable.get(n, n) for n, _ in reversed(top)]
                values = [v for _, v in reversed(top)]
                colors = ["#2ecc71" if v > 0 else "#e74c3c" for v in values]
                fig, ax = plt.subplots(figsize=(6, 3.2))
                bars = ax.barh(names, values, color=colors)
                ax.axvline(0, color="#888", linewidth=0.8)
                for bar, v in zip(bars, values):
                    ax.text(
                        bar.get_width() + (0.002 if v >= 0 else -0.002),
                        bar.get_y() + bar.get_height() / 2,
                        f"{v:+.3f}", va="center",
                        ha="left" if v >= 0 else "right", fontsize=8,
                    )
                ax.set_xlabel("Effect on the decision")
                ax.set_title("What mattered most in this decision")
                fig.tight_layout()
                st.pyplot(fig)
                plt.close(fig)
                st.caption("🟢 Green = made the signature look more **genuine**. "
                           "🔴 Red = made it look more **forged**. Longer bar = bigger effect.")

            with col_donut:
                # A second, different chart type (as requested) — a simple
                # confidence donut, immediately readable without any
                # explanation needed, showing the Genuine vs Forged split.
                fig2, ax2 = plt.subplots(figsize=(3.2, 3.2))
                sizes = [avg_proba_genuine, 1 - avg_proba_genuine]
                colors2 = ["#2ecc71", "#e74c3c"]
                wedges, _ = ax2.pie(sizes, colors=colors2, startangle=90,
                                     wedgeprops=dict(width=0.4))
                ax2.text(0, 0, f"{ensemble_confidence}%\n{ensemble_verdict}",
                         ha="center", va="center", fontsize=13, fontweight="bold")
                ax2.set_title("Overall confidence split")
                fig2.tight_layout()
                st.pyplot(fig2)
                plt.close(fig2)
                st.caption("🟢 Genuine likelihood · 🔴 Forged likelihood")

        st.caption(f"Explanation backend: {explanation['backend'].upper()}")

        db = get_db()
        record = {
            "user_id": st.session_state.user_id,
            "image_filename": uploaded_file.name,
            "prediction": ensemble_verdict,
            "confidence": ensemble_confidence,
            "model_used": "ensemble (svm + random_forest)",
            "prediction_time_ms": results["svm"]["prediction_time_ms"] + results["random_forest"]["prediction_time_ms"],
            "features": results["random_forest"]["features"],
            "explanation_summary": explanation["plain_language"],
        }
        db.save_prediction(record)
        st.toast("Prediction saved to your history.", icon="✅")

        report_result = dict(results["random_forest"])
        report_result["prediction"] = ensemble_verdict
        report_result["confidence"] = ensemble_confidence
        report_result["explanation_summary"] = explanation["plain_language"]
        report_result["top_features"] = explanation.get("top_features", [])
        pdf_bytes = generate_prediction_report(
            report_result, image, st.session_state.user.get("email", "user")
        )
        st.download_button(
            "📄 Download PDF Report", data=pdf_bytes,
            file_name=f"forgexplain_report_{uploaded_file.name}.pdf",
            mime="application/pdf", use_container_width=True,
        )
