"""
signer_verifier.py
---------------------
Writer-DEPENDENT verification: "does this signature match THIS specific
person's signature on file?" — as opposed to predictor.py's writer-
INDEPENDENT classifier, which asks "does this look like a genuine
signature in general?"

This is the approach real banks and legal-document systems use: a person
registers a specimen signature once, and every future signature is
compared against *that* reference, not judged in the abstract.

Reuses the exact same preprocessing (ImageProcessor) and feature
extraction (FeatureExtractor, the same 23 named features SHAP already
explains) as the generic pipeline, plus the same trained StandardScaler,
so results stay on a comparable, already-validated footing — this is
purely a different comparison step at the end, not a different model.

Similarity metric: cosine similarity between scaled feature vectors.
Cosine (not raw Euclidean distance) is used because it's insensitive to
uniform scale differences between two otherwise identically-shaped
feature vectors (e.g. a slightly larger scan of the same signature),
which matters more here than in classification since we're comparing
one specific person's own strokes to themselves, not to a general
learned decision boundary.
"""

import json
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional

from preprocessing.image_processor import ImageProcessor
from features.feature_extractor import FeatureExtractor, FEATURE_NAMES
from utils.config import SIMILARITY_THRESHOLD_PATH
from utils.logger import get_logger

logger = get_logger(__name__)

_DEFAULT_THRESHOLD = 0.90  # conservative fallback if calibration file is missing


class SignerVerifier:
    def __init__(self, scaler):
        """scaler: the trained StandardScaler — pass predictor.get_scaler()
        so this always uses the exact same fitted scaler as the classifier."""
        self.processor = ImageProcessor()
        self.extractor = FeatureExtractor()
        self.scaler = scaler

    # ---- Feature extraction ------------------------------------------------
    def extract_raw_vector(self, image_bgr: np.ndarray) -> np.ndarray:
        """Runs the shared preprocessing + feature pipeline, returns the
        23-dim RAW (unscaled) feature vector in FEATURE_NAMES order."""
        stages = self.processor.process(image_bgr)
        feats = self.extractor.extract(stages["normalized"], grayscale_image=stages["grayscale"])
        row = pd.DataFrame([feats])[FEATURE_NAMES]
        return row.values[0].astype(float)

    # ---- Registration (enrollment) -----------------------------------------
    def build_template(self, images: List[np.ndarray]) -> np.ndarray:
        """
        Averages the raw feature vectors of one or more reference signatures
        into a single template. Averaging multiple genuine specimens (like
        a bank asking for 2-3 signature samples at account opening) makes
        the template more representative of the person's natural variation
        than any single sample would be.
        """
        vectors = [self.extract_raw_vector(img) for img in images]
        return np.mean(np.stack(vectors, axis=0), axis=0)

    # ---- Comparison ---------------------------------------------------------
    def similarity(self, raw_vec_a: np.ndarray, raw_vec_b: np.ndarray) -> float:
        """Cosine similarity between two raw feature vectors, after scaling
        both through the trained scaler so every feature contributes on a
        comparable footing (area and hu-moments live on very different
        native scales)."""
        a = self.scaler.transform(pd.DataFrame([raw_vec_a], columns=FEATURE_NAMES))[0]
        b = self.scaler.transform(pd.DataFrame([raw_vec_b], columns=FEATURE_NAMES))[0]
        denom = (np.linalg.norm(a) * np.linalg.norm(b))
        if denom == 0:
            return 0.0
        cos_sim = float(np.dot(a, b) / denom)
        # Cosine similarity ranges [-1, 1]; rescale to [0, 1] so it reads
        # like a plain match percentage in the UI.
        return (cos_sim + 1) / 2

    def verify(self, template_raw_vec: np.ndarray, query_image: np.ndarray) -> Dict[str, Any]:
        query_vec = self.extract_raw_vector(query_image)
        sim = self.similarity(template_raw_vec, query_vec)
        threshold = get_similarity_threshold()
        is_match = sim >= threshold
        return {
            "similarity": round(sim * 100, 1),
            "threshold": round(threshold * 100, 1),
            "is_match": is_match,
            "verdict": "Matches registered signature" if is_match else "Does not match registered signature",
        }


def get_similarity_threshold() -> float:
    """Loads the calibrated match threshold produced by
    ml_models/calibrate_similarity_threshold.py, falling back to a
    conservative default if calibration hasn't been run yet."""
    if SIMILARITY_THRESHOLD_PATH.exists():
        try:
            with open(SIMILARITY_THRESHOLD_PATH) as f:
                data = json.load(f)
            return float(data["threshold"])
        except Exception as e:
            logger.warning("Could not load calibrated threshold, using default: %s", e)
    return _DEFAULT_THRESHOLD
