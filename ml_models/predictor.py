"""
predictor.py
-------------
Loads trained models (joblib) and runs the full prediction workflow:
    preprocess -> extract features -> scale -> predict -> confidence -> timing
"""

import time
import json
import joblib
import numpy as np
import pandas as pd
import streamlit as st
from pathlib import Path
from typing import Dict, Any

from preprocessing.image_processor import ImageProcessor
from features.feature_extractor import FeatureExtractor, FEATURE_NAMES
from utils.config import (
    SVM_MODEL_PATH, RF_MODEL_PATH, SCALER_PATH, METRICS_PATH, DEFAULT_MODEL,
)
from utils.logger import get_logger

logger = get_logger(__name__)

LABEL_MAP = {1: "Genuine", 0: "Forged"}


class ModelNotTrainedError(Exception):
    pass


class SignaturePredictor:
    def __init__(self):
        self.processor = ImageProcessor()
        self.extractor = FeatureExtractor()
        self._models = {}
        self._scaler = None

    def _ensure_loaded(self):
        if not (SVM_MODEL_PATH.exists() and RF_MODEL_PATH.exists() and SCALER_PATH.exists()):
            raise ModelNotTrainedError(
                "Models are not trained yet. Run `python -m ml_models.train_pipeline` "
                "or use the 'Train Models' option in the admin dashboard."
            )
        if self._scaler is None:
            self._scaler = joblib.load(SCALER_PATH)
        if "svm" not in self._models:
            self._models["svm"] = joblib.load(SVM_MODEL_PATH)
        if "random_forest" not in self._models:
            self._models["random_forest"] = joblib.load(RF_MODEL_PATH)

    def get_metrics(self) -> Dict[str, Any]:
        if METRICS_PATH.exists():
            with open(METRICS_PATH) as f:
                return json.load(f)
        return {}

    def predict(self, image: np.ndarray, model_name: str = DEFAULT_MODEL) -> Dict[str, Any]:
        """
        Full prediction workflow. Returns a dict with prediction label,
        confidence, timing, model used, extracted features, and the
        preprocessing stages (for UI display / SHAP background).
        """
        self._ensure_loaded()
        if model_name not in self._models:
            raise ValueError(f"Unknown model '{model_name}'. Choose from {list(self._models)}.")

        start = time.time()

        stages = self.processor.process(image)
        feats = self.extractor.extract(stages["normalized"], grayscale_image=stages["grayscale"])
        X = pd.DataFrame([feats])[FEATURE_NAMES]
        X_scaled = self._scaler.transform(X)

        model = self._models[model_name]
        pred_class = int(model.predict(X_scaled)[0])
        proba = model.predict_proba(X_scaled)[0]
        confidence = float(np.max(proba))
        # class order follows model.classes_ (sklearn sorts ascending: [0, 1] = [Forged, Genuine])
        proba_forged, proba_genuine = float(proba[0]), float(proba[1])

        elapsed_ms = (time.time() - start) * 1000

        result = {
            "prediction": LABEL_MAP[pred_class],
            "prediction_class": pred_class,
            "confidence": round(confidence * 100, 2),
            "proba_genuine": proba_genuine,
            "proba_forged": proba_forged,
            "model_used": model_name,
            "prediction_time_ms": round(elapsed_ms, 2),
            "features": feats,
            "feature_vector_scaled": X_scaled,
            "feature_vector_raw": X,
            "stages": stages,
        }
        logger.info("Prediction: %s (%.1f%% confidence, %s, %.1fms)",
                    result["prediction"], result["confidence"], model_name, elapsed_ms)
        return result

    def get_model(self, model_name: str):
        self._ensure_loaded()
        return self._models[model_name]

    def get_scaler(self):
        self._ensure_loaded()
        return self._scaler


@st.cache_resource(show_spinner=False)
def get_feature_predictor() -> "SignaturePredictor":
    """Cached singleton — see get_pixel_predictor() for why this matters."""
    predictor = SignaturePredictor()
    try:
        predictor._ensure_loaded()
    except ModelNotTrainedError:
        pass  # let callers surface this the same way they already do
    return predictor
