"""
pixel_predictor.py
---------------------
Prediction engine for the externally-trained pixel-based Random Forest
model (random_forest_model.joblib + label_encoder.joblib).

CRITICAL: preprocessing here must exactly mirror the training-time script:

    img = load_img(path, target_size=(128, 128))   # PIL, RGB, 'nearest' resample
    img_array = img_to_array(img)                    # (128, 128, 3) float32
    img_array = img_array / 255.0                     # normalize to [0, 1]
    flat = img_array.reshape(1, -1)                    # (1, 49152)

We replicate this with Pillow directly (no TensorFlow dependency needed
just to load an image) rather than through OpenCV, because OpenCV loads
BGR by default and uses different resize interpolation — either mismatch
would silently corrupt predictions since the model has no idea its input
distribution changed.
"""

import io
import time
import joblib
import numpy as np
import streamlit as st
from PIL import Image
from typing import Dict, Any

from utils.config import PIXEL_MODEL_PATH, LABEL_ENCODER_PATH, PIXEL_IMAGE_SIZE
from utils.logger import get_logger

logger = get_logger(__name__)


class PixelModelNotFoundError(Exception):
    pass


class PixelSignaturePredictor:
    def __init__(self):
        self._model = None
        self._label_encoder = None

    def _ensure_loaded(self):
        if not (PIXEL_MODEL_PATH.exists() and LABEL_ENCODER_PATH.exists()):
            raise PixelModelNotFoundError(
                f"Pixel model files not found. Expected {PIXEL_MODEL_PATH.name} and "
                f"{LABEL_ENCODER_PATH.name} in trained_models/."
            )
        if self._model is None:
            self._model = joblib.load(PIXEL_MODEL_PATH)
        if self._label_encoder is None:
            self._label_encoder = joblib.load(LABEL_ENCODER_PATH)

    @staticmethod
    def preprocess_from_bytes(file_bytes: bytes) -> np.ndarray:
        """
        Returns the (128, 128, 3) float32 array in [0, 1], RGB — i.e. exactly
        what img_to_array(load_img(...)) / 255.0 would produce, but built
        from raw upload bytes instead of a file path.
        """
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        img = img.resize(PIXEL_IMAGE_SIZE, Image.NEAREST)  # Keras load_img default resample
        arr = np.asarray(img).astype("float32") / 255.0
        return arr  # (H, W, 3)

    def predict(self, file_bytes: bytes) -> Dict[str, Any]:
        self._ensure_loaded()
        start = time.time()

        img_array = self.preprocess_from_bytes(file_bytes)
        flat = img_array.reshape(1, -1)

        pred_encoded = self._model.predict(flat)
        proba = self._model.predict_proba(flat)[0]
        predicted_label = self._label_encoder.inverse_transform(pred_encoded)[0]

        confidence = float(np.max(proba)) * 100
        elapsed_ms = (time.time() - start) * 1000

        # Normalize label casing/wording for consistent UI display
        display_label = "Genuine" if predicted_label.lower() == "original" else "Forged"

        class_probs = {
            self._label_encoder.inverse_transform([i])[0]: float(p)
            for i, p in enumerate(proba)
        }

        result = {
            "prediction": display_label,
            "prediction_raw_label": predicted_label,
            "confidence": round(confidence, 2),
            "class_probabilities": class_probs,
            "model_used": "pixel_random_forest",
            "prediction_time_ms": round(elapsed_ms, 2),
            "image_array": img_array,       # (128,128,3) in [0,1], RGB — for heatmap overlay
            "flat_features": flat,          # (1, 49152) — for SHAP
        }
        logger.info("Pixel-model prediction: %s (%.1f%% confidence, %.1fms)",
                    display_label, confidence, elapsed_ms)
        return result

    def get_model(self):
        self._ensure_loaded()
        return self._model

    def get_label_encoder(self):
        self._ensure_loaded()
        return self._label_encoder


@st.cache_resource(show_spinner=False)
def get_pixel_predictor() -> "PixelSignaturePredictor":
    """
    Cached singleton. Without this, Streamlit's full-script rerun on every
    click/interaction would re-run joblib.load() on the ~500KB model file
    from scratch every single time — this is the #1 cause of the app
    feeling slow. st.cache_resource keeps one loaded instance alive across
    reruns (and across users, since the model is stateless/read-only).
    """
    predictor = PixelSignaturePredictor()
    predictor._ensure_loaded()  # load immediately so the cache holds a ready instance
    return predictor
