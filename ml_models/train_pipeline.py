"""
train_pipeline.py
--------------------
End-to-end training pipeline:
    load dataset -> preprocess (OpenCV) -> extract features -> scale ->
    train SVM + Random Forest -> evaluate -> save models + metrics with joblib

Run directly:  python -m ml_models.train_pipeline
"""

import json
import time
import joblib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, roc_curve, auc,
)

from dataset.dataset_loader import load_dataset
from preprocessing.image_processor import ImageProcessor
from features.feature_extractor import FeatureExtractor, FEATURE_NAMES
from utils.config import (
    SVM_MODEL_PATH, RF_MODEL_PATH, SCALER_PATH, METRICS_PATH,
    FEATURE_NAMES_PATH, RANDOM_STATE, TEST_SIZE, SHAP_BACKGROUND_PATH,
)
from utils.logger import get_logger

logger = get_logger(__name__)


def build_feature_dataset(source: str = "auto"):
    """Loads raw images, runs them through the OpenCV pipeline, extracts features."""
    images, labels = load_dataset(source=source)
    processor = ImageProcessor()
    extractor = FeatureExtractor()

    rows = []
    for img in images:
        stages = processor.process(img)
        feats = extractor.extract(stages["normalized"], grayscale_image=stages["grayscale"])
        rows.append(feats)

    import pandas as pd
    X = pd.DataFrame(rows)[FEATURE_NAMES]
    y = np.array(labels)
    logger.info("Built feature dataset: X=%s, y=%s", X.shape, y.shape)
    return X, y


def _evaluate(model, X_test, y_test) -> dict:
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1] if hasattr(model, "predict_proba") else y_pred

    fpr, tpr, _ = roc_curve(y_test, y_proba)
    roc_auc = auc(fpr, tpr)

    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_test, y_pred, zero_division=0)),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "roc_curve": {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": float(roc_auc)},
    }


def train_all_models(source: str = "auto") -> dict:
    """Trains SVM + Random Forest, saves both + scaler + metrics via joblib/json."""
    X, y = build_feature_dataset(source=source)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    all_metrics = {}

    # ---- SVM -----------------------------------------------------------------
    t0 = time.time()
    svm = SVC(kernel="rbf", C=2.0, gamma="scale", probability=True, random_state=RANDOM_STATE)
    svm.fit(X_train_scaled, y_train)
    svm_train_time = time.time() - t0
    all_metrics["svm"] = _evaluate(svm, X_test_scaled, y_test)
    all_metrics["svm"]["train_time_sec"] = svm_train_time
    joblib.dump(svm, SVM_MODEL_PATH)
    logger.info("SVM trained: acc=%.3f f1=%.3f", all_metrics["svm"]["accuracy"], all_metrics["svm"]["f1_score"])

    # ---- Random Forest ------------------------------------------------------------
    t0 = time.time()
    rf = RandomForestClassifier(
        n_estimators=300, max_depth=None, min_samples_split=2,
        random_state=RANDOM_STATE, n_jobs=-1,
    )
    rf.fit(X_train_scaled, y_train)
    rf_train_time = time.time() - t0
    all_metrics["random_forest"] = _evaluate(rf, X_test_scaled, y_test)
    all_metrics["random_forest"]["train_time_sec"] = rf_train_time
    joblib.dump(rf, RF_MODEL_PATH)
    logger.info("RF trained: acc=%.3f f1=%.3f", all_metrics["random_forest"]["accuracy"],
                all_metrics["random_forest"]["f1_score"])

    # ---- Persist scaler, feature names, metrics ------------------------------------
    joblib.dump(scaler, SCALER_PATH)
    with open(FEATURE_NAMES_PATH, "w") as f:
        json.dump(FEATURE_NAMES, f)
    with open(METRICS_PATH, "w") as f:
        json.dump(all_metrics, f, indent=2)

    # ---- Persist a small REAL background sample for SHAP (SVM KernelExplainer) ----
    # Without this, the explainability layer had no representative background and
    # was rebuilding a throwaway one from the single query point on every request —
    # both slow (fresh KernelExplainer + kmeans every prediction) and not meaningful
    # (explaining a point relative to only itself). Save 50 real, scaled training
    # rows once here; explainer.py loads + caches this instead.
    rng = np.random.default_rng(RANDOM_STATE)
    bg_idx = rng.choice(len(X_train_scaled), size=min(50, len(X_train_scaled)), replace=False)
    np.save(SHAP_BACKGROUND_PATH, np.asarray(X_train_scaled)[bg_idx])

    logger.info("Training complete. Models + metrics saved to trained_models/.")
    return all_metrics


if __name__ == "__main__":
    metrics = train_all_models(source="auto")
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "roc_curve"}
                       for k, v in metrics.items()}, indent=2))
