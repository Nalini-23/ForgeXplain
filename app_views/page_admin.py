"""
page_admin.py
--------------
Admin-only dashboard: view all users, view/manage prediction history
system-wide, and trigger model retraining.
"""

import streamlit as st
import pandas as pd
from database.db_interface import get_db
from auth.auth_manager import AuthError
from utils.ui_helpers import render_page_header


def render():
    render_page_header("🛠️", "Admin Panel", "Manage users, review system-wide predictions, and retrain models.")

    if st.session_state.role != "admin":
        st.error("You do not have permission to view this page.")
        return

    db = get_db()
    tab_users, tab_predictions, tab_retrain, tab_signers = st.tabs(
        ["👥 Manage Users", "📈 All Predictions", "🔁 Retrain Models", "🖊️ Registered Signers"]
    )

    with tab_users:
        users = db.list_users()
        st.write(f"**Total users:** {len(users)}")
        df_users = pd.DataFrame(users)
        st.dataframe(df_users, use_container_width=True, hide_index=True)

        st.divider()
        st.subheader("Delete a user")
        if users:
            emails = [u["email"] for u in users]
            selected_email = st.selectbox("Select user to delete", emails)
            if st.button("🗑️ Delete User", type="secondary"):
                user_to_delete = next(u for u in users if u["email"] == selected_email)
                if user_to_delete["id"] == st.session_state.user_id:
                    st.error("You cannot delete your own account while logged in.")
                else:
                    db.delete_user(user_to_delete["id"])
                    st.success(f"Deleted {selected_email}.")
                    st.rerun()

    with tab_predictions:
        all_preds = db.get_all_predictions()
        st.write(f"**Total predictions across all users:** {len(all_preds)}")
        if all_preds:
            df = pd.DataFrame(all_preds)
            st.dataframe(
                df[["created_at", "user_id", "prediction", "confidence", "model_used"]]
                if "user_id" in df.columns else df,
                use_container_width=True, hide_index=True,
            )
        else:
            st.info("No predictions recorded yet.")

    with tab_retrain:
        st.subheader("Retrain Models")
        st.caption("Retrains SVM + Random Forest on the configured dataset source "
                   "(CEDAR if present under dataset/CEDAR/, else synthetic fallback).")
        source = st.selectbox("Dataset source", ["auto", "cedar", "synthetic"])
        if st.button("🔁 Start Retraining", type="primary"):
            with st.spinner("Training models — this may take a minute..."):
                try:
                    from ml_models.train_pipeline import train_all_models
                    metrics = train_all_models(source=source)
                    st.success("Retraining complete!")
                    for model_name, m in metrics.items():
                        st.write(f"**{model_name.replace('_',' ').title()}** — "
                                 f"Accuracy: {m['accuracy']*100:.2f}%, F1: {m['f1_score']*100:.2f}%")
                except Exception as e:
                    st.error(f"Training failed: {e}")

    with tab_signers:
        _render_signer_registration(db)


def _render_signer_registration(db):
    """Enroll a person's reference signature(s) for writer-dependent
    verification — the way a bank captures a signature card at account
    opening. Multiple samples are averaged into one template, which is
    more representative of the person's natural variation than a single
    sample would be."""
    import cv2
    import numpy as np
    from preprocessing.image_processor import ImageProcessor
    from preprocessing.signature_detector import SignatureDetector
    from ml_models.predictor import get_feature_predictor, ModelNotTrainedError
    from verification.signer_verifier import SignerVerifier

    st.subheader("Register a Signer")
    st.caption("Enroll a person's reference signature(s) so signatures can later be checked "
               "against THIS specific person, instead of judged generically. Upload 1-3 clear "
               "reference samples — a full document photo is fine, the signature region is "
               "auto-detected and cropped.")

    name = st.text_input("Person's full name")
    ref_files = st.file_uploader(
        "Reference signature(s)", type=["png", "jpg", "jpeg", "bmp", "tiff"],
        accept_multiple_files=True, key="signer_reg_upload",
    )

    if st.button("✅ Register Signer", type="primary"):
        if not name.strip():
            st.error("Please enter the person's name.")
        elif not ref_files:
            st.error("Please upload at least one reference signature.")
        else:
            try:
                predictor = get_feature_predictor()
                scaler = predictor.get_scaler()
            except ModelNotTrainedError as e:
                st.error(str(e))
                return

            detector = SignatureDetector()
            images = []
            preview_cols = st.columns(min(len(ref_files), 3))
            for i, f in enumerate(ref_files):
                try:
                    full_image = ImageProcessor.load_image_from_bytes(f.read())
                except ValueError as e:
                    st.error(f"{f.name}: {e}")
                    continue
                cropped, was_cropped, _box = detector.detect_and_crop_with_box(full_image)
                images.append(cropped)
                with preview_cols[i % len(preview_cols)]:
                    st.image(cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB),
                              caption=f"{f.name}" + (" (auto-cropped)" if was_cropped else ""),
                              use_container_width=True)

            if not images:
                st.error("No usable reference images.")
                return

            verifier = SignerVerifier(scaler=scaler)
            template = verifier.build_template(images)
            db.register_signer(
                name=name, feature_vector=template.tolist(),
                num_samples=len(images), registered_by=st.session_state.user_id,
            )
            st.success(f"✅ Registered {name} with {len(images)} reference sample(s).")
            st.rerun()

    st.divider()
    st.subheader("Registered Signers")
    signers = db.list_signers()
    if not signers:
        st.info("No signers registered yet.")
        return

    df = pd.DataFrame(signers)
    st.dataframe(df, use_container_width=True, hide_index=True)

    signer_names = [f"{s['name']} ({s['num_samples']} sample(s))" for s in signers]
    selected = st.selectbox("Select a signer to delete", signer_names)
    if st.button("🗑️ Delete Signer", type="secondary"):
        idx = signer_names.index(selected)
        db.delete_signer(signers[idx]["id"])
        st.success(f"Deleted {signers[idx]['name']}.")
        st.rerun()
