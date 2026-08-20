"""
feature_extractor.py
----------------------
Extracts a fixed-length, interpretable feature vector from a preprocessed
(binary, normalized) signature image. Interpretability matters here because
these are exactly the features SHAP/LIME will explain later — every feature
name below is what the user sees in the "why did the model decide this"
explanation, so names are kept human-readable on purpose.

Feature groups:
    - Geometric:      area, perimeter, aspect_ratio, bounding box dims
    - Shape:          7 Hu Moments (rotation/scale/translation invariant)
    - Density:        pixel density, black-to-white ratio
    - Contour:        number of contours, average contour size, solidity
    - Histogram:      6-bin intensity histogram of the grayscale image
"""

import cv2
import numpy as np
import pandas as pd
from typing import Dict, List
from utils.logger import get_logger

logger = get_logger(__name__)

FEATURE_NAMES: List[str] = [
    "area", "perimeter", "aspect_ratio", "bbox_width", "bbox_height",
    "hu_moment_1", "hu_moment_2", "hu_moment_3", "hu_moment_4",
    "hu_moment_5", "hu_moment_6", "hu_moment_7",
    "pixel_density", "black_white_ratio",
    "num_contours", "avg_contour_area", "solidity",
    "hist_bin_1", "hist_bin_2", "hist_bin_3", "hist_bin_4", "hist_bin_5", "hist_bin_6",
]


class FeatureExtractor:
    def extract(self, binary_image: np.ndarray, grayscale_image: np.ndarray = None) -> Dict[str, float]:
        """
        binary_image: normalized binary (0/255) signature image, foreground=255
        grayscale_image: optional original grayscale (pre-threshold) for histogram features
        """
        features: Dict[str, float] = {}

        contours, _ = cv2.findContours(binary_image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # ---- Geometric features -------------------------------------------
        if contours:
            all_points = np.vstack(contours)
            x, y, w, h = cv2.boundingRect(all_points)
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            perimeter = cv2.arcLength(largest, True)
        else:
            x, y, w, h, area, perimeter = 0, 0, 1, 1, 0.0, 0.0

        features["area"] = float(area)
        features["perimeter"] = float(perimeter)
        features["aspect_ratio"] = float(w / h) if h > 0 else 0.0
        features["bbox_width"] = float(w)
        features["bbox_height"] = float(h)

        # ---- Hu Moments (shape descriptors) --------------------------------
        moments = cv2.moments(binary_image)
        hu = cv2.HuMoments(moments).flatten()
        # log-scale for numerical stability (standard practice for Hu moments)
        hu_log = -np.sign(hu) * np.log10(np.abs(hu) + 1e-30)
        for i in range(7):
            features[f"hu_moment_{i+1}"] = float(hu_log[i])

        # ---- Density features -----------------------------------------------
        total_pixels = binary_image.size
        black_pixels = int(np.sum(binary_image == 0))
        white_pixels = int(np.sum(binary_image > 0))  # foreground stroke pixels
        features["pixel_density"] = float(white_pixels / total_pixels) if total_pixels else 0.0
        features["black_white_ratio"] = float(black_pixels / (white_pixels + 1e-6))

        # ---- Contour features -------------------------------------------------
        features["num_contours"] = float(len(contours))
        if contours:
            avg_area = float(np.mean([cv2.contourArea(c) for c in contours]))
            hull = cv2.convexHull(np.vstack(contours))
            hull_area = cv2.contourArea(hull)
            solidity = float(area / hull_area) if hull_area > 0 else 0.0
        else:
            avg_area, solidity = 0.0, 0.0
        features["avg_contour_area"] = avg_area
        features["solidity"] = solidity

        # ---- Histogram features (6-bin, normalized) ---------------------------
        source_for_hist = grayscale_image if grayscale_image is not None else binary_image
        hist = cv2.calcHist([source_for_hist], [0], None, [6], [0, 256]).flatten()
        hist = hist / (hist.sum() + 1e-6)
        for i in range(6):
            features[f"hist_bin_{i+1}"] = float(hist[i])

        return features

    def extract_as_dataframe(self, binary_image: np.ndarray, grayscale_image: np.ndarray = None) -> pd.DataFrame:
        feats = self.extract(binary_image, grayscale_image)
        return pd.DataFrame([feats])[FEATURE_NAMES]

    def batch_extract(self, images: List[np.ndarray]) -> pd.DataFrame:
        """Used by the training pipeline to build the full feature dataset."""
        rows = [self.extract(img) for img in images]
        df = pd.DataFrame(rows)
        logger.info("Batch-extracted features for %d images.", len(images))
        return df[FEATURE_NAMES]
