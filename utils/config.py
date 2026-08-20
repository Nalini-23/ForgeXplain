"""
config.py
----------
Central configuration for ForgeXplain.

All paths, constants, and environment-driven settings live here so that
every other module imports config instead of hardcoding values. This is
what lets the storage backend, dataset source, or deployment target change
without touching business logic elsewhere in the app.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()  # loads .env if present (local dev); in Docker/AWS, env vars are injected directly

# ---------------------------------------------------------------------------
# Base paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

DATASET_DIR = BASE_DIR / "dataset"
CEDAR_DIR = DATASET_DIR / "CEDAR"
SYNTHETIC_DIR = DATASET_DIR / "synthetic"

TRAINED_MODELS_DIR = BASE_DIR / "trained_models"
REPORTS_DIR = BASE_DIR / "reports"
ASSETS_DIR = BASE_DIR / "assets"
LOGS_DIR = BASE_DIR / "logs"

for d in [TRAINED_MODELS_DIR, REPORTS_DIR, LOGS_DIR, SYNTHETIC_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Storage backend switch
# ---------------------------------------------------------------------------
# "supabase"  -> uses database/supabase_client.py  (requires SUPABASE_URL + SUPABASE_KEY)
# "local"     -> uses database/local_store.py      (SQLite, zero external dependency)
#
# The rest of the app talks to database/db_interface.py ONLY, so switching
# this one value is the entire migration path to Supabase/AWS RDS/etc.
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").lower()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

LOCAL_DB_PATH = BASE_DIR / "database" / "forgexplain.db"

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
PASSWORD_MIN_LENGTH = 8

# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------
IMAGE_SIZE = (220, 155)  # (width, height) - standard CEDAR-style normalized size
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "bmp", "tiff"}

# ---------------------------------------------------------------------------
# ML
# ---------------------------------------------------------------------------
MODEL_NAMES = ["svm", "random_forest"]
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "random_forest")
RANDOM_STATE = 42
TEST_SIZE = 0.2

SVM_MODEL_PATH = TRAINED_MODELS_DIR / "svm_model.joblib"
RF_MODEL_PATH = TRAINED_MODELS_DIR / "random_forest_model.joblib"
SCALER_PATH = TRAINED_MODELS_DIR / "feature_scaler.joblib"
METRICS_PATH = TRAINED_MODELS_DIR / "model_metrics.json"
SHAP_BACKGROUND_PATH = TRAINED_MODELS_DIR / "shap_background.npy"
FEATURE_NAMES_PATH = TRAINED_MODELS_DIR / "feature_names.json"

# ---------------------------------------------------------------------------
# Writer-dependent verification (registered signer specimen matching)
# ---------------------------------------------------------------------------
# Produced by ml_models/calibrate_similarity_threshold.py — see that file
# for how the match threshold is derived.
SIMILARITY_THRESHOLD_PATH = TRAINED_MODELS_DIR / "similarity_threshold.json"

# ---------------------------------------------------------------------------
# Pixel-based model (externally trained: flattened 128x128 RGB image -> RF)
# ---------------------------------------------------------------------------
# This is a second, independent detection engine alongside the hand-engineered
# feature pipeline above. It was trained outside this app (Keras-style
# preprocessing: load_img(target_size=(128,128)) -> img_to_array -> /255.0 ->
# flatten) and is loaded as-is via joblib. ACTIVE_ENGINE controls which one
# the Signature Detection page uses.
#
# "pixel"    -> ml_models/pixel_predictor.py  (uses the two files below)
# "features" -> ml_models/predictor.py        (SVM/RF on 23 engineered features)
ACTIVE_ENGINE = os.getenv("ACTIVE_ENGINE", "features").lower()

PIXEL_MODEL_PATH = TRAINED_MODELS_DIR / "pixel_rf_model.joblib"
LABEL_ENCODER_PATH = TRAINED_MODELS_DIR / "label_encoder.joblib"
PIXEL_IMAGE_SIZE = (128, 128)  # (width, height) — MUST match training exactly

# ---------------------------------------------------------------------------
# Explainability
# ---------------------------------------------------------------------------
XAI_BACKEND_PREFERENCE = ["shap", "lime"]
SHAP_BACKGROUND_SAMPLES = 50

# ---------------------------------------------------------------------------
# App metadata
# ---------------------------------------------------------------------------
APP_NAME = "ForgeXplain"
APP_TAGLINE = "Explainable AI-Powered Offline Signature Forgery Detection"
APP_VERSION = "1.0.0"
