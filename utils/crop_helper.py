"""
crop_helper.py
----------------
Shared "auto-detect the signature region, then let the user confirm or
adjust it" UI flow. Originally this lived only in the (unused) pixel
engine page — pulled out here so both the main Detection page and the
new Signer Registration page can reuse the exact same UX and logic
instead of duplicating it.

Usage pattern (inside a Streamlit page function):

    resolved = resolve_signature_region(file_bytes, widget_key="detect")
    if resolved is None:
        return   # waiting on user to confirm a crop; page should stop here
    final_image, was_cropped = resolved
"""

from typing import Optional, Tuple
import cv2
import numpy as np
import streamlit as st

from preprocessing.image_processor import ImageProcessor
from preprocessing.signature_detector import SignatureDetector


def resolve_signature_region(
    file_bytes: bytes, widget_key: str, file_id: str = None
) -> Optional[Tuple[np.ndarray, bool]]:
    """
    Loads the uploaded image, auto-detects whether it looks like a full
    document (vs. an already-tight signature scan), and if so shows an
    editable crop box pre-filled with the detector's best guess — the
    heuristic is a *suggestion*, never applied silently, since it isn't
    guaranteed correct on messy real-world document photos.

    Returns:
        (final_image_bgr, was_cropped)  once resolved, or
        None if a document was detected and we're waiting on the user to
        press "Confirm" (caller should treat None as "stop rendering
        further content this run" — a st.rerun() will follow the click).
    """
    confirm_state_key = f"_confirmed_crop_{widget_key}"
    last_file_key = f"_last_file_id_{widget_key}"

    if file_id is not None and st.session_state.get(last_file_key) != file_id:
        st.session_state[confirm_state_key] = None
        st.session_state[last_file_key] = file_id

    full_image = ImageProcessor.load_image_from_bytes(file_bytes)

    detector = SignatureDetector()
    cropped_image, was_cropped, box = detector.detect_and_crop_with_box(full_image)

    if not was_cropped:
        # Already a tight signature-only scan (or nothing worth cropping found).
        return cropped_image, False

    if st.session_state.get(confirm_state_key) is not None:
        final_image = st.session_state[confirm_state_key]
        st.success("✅ Using your confirmed signature region.")
        st.image(cv2.cvtColor(final_image, cv2.COLOR_BGR2RGB),
                  caption="Region used for analysis", width=320)
        if st.button("↩️ Re-adjust crop", key=f"readjust_{widget_key}"):
            st.session_state[confirm_state_key] = None
            st.rerun()
        return final_image, True

    from streamlit_cropper import st_cropper
    from PIL import Image as PILImage

    st.info("📄 This looks like a full document, not just a signature. "
            "The box below is our best guess at the signature region — "
            "**drag its edges to fix it** if it's grabbing a date, printed "
            "text, or the wrong area, then confirm.")
    full_pil = PILImage.fromarray(cv2.cvtColor(full_image, cv2.COLOR_BGR2RGB))
    # st_cropper's default_coords expects (left, right, top, bottom) —
    # our detector returns (left, top, right, bottom), so reorder.
    default_coords = (box[0], box[2], box[1], box[3]) if box else None
    cropped_pil = st_cropper(full_pil, realtime_update=True, box_color="#A855F7",
                              aspect_ratio=None, default_coords=default_coords,
                              key=f"cropper_{widget_key}")
    if st.button("✅ Confirm this region & analyze", type="primary", key=f"confirm_{widget_key}"):
        st.session_state[confirm_state_key] = cv2.cvtColor(np.array(cropped_pil), cv2.COLOR_RGB2BGR)
        st.rerun()
    return None
