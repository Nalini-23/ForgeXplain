"""
dataset_loader.py
--------------------
Loads signature images + genuine/forged labels for training.

Expected CEDAR layout (download separately - see dataset/README.md):
    dataset/CEDAR/
        full_org/    original_1_1.png ... original_55_24.png   (genuine)
        full_forg/   forgeries_1_1.png ... forgeries_55_24.png (forged)

BHSig260 / GPDS can be added later by writing one more `_load_<name>()`
method with the same return contract: (list_of_images, list_of_labels).
No other code needs to change — train_pipeline.py just calls load_dataset().

Since this sandbox has no access to download CEDAR, `synthetic` mode
generates a stroke-like signature dataset (via Bezier-curve renders +
controlled distortions for "forged" samples) so the whole pipeline —
feature extraction, training, evaluation, SHAP — runs end-to-end
immediately. Swap DATASET_SOURCE to "cedar" once the real files are in
dataset/CEDAR/.
"""

import os
import cv2
import numpy as np
from pathlib import Path
from typing import List, Tuple
from utils.config import CEDAR_DIR, SYNTHETIC_DIR, IMAGE_SIZE
from utils.logger import get_logger

logger = get_logger(__name__)


def _load_cedar() -> Tuple[List[np.ndarray], List[int]]:
    """label: 1 = genuine, 0 = forged"""
    images, labels = [], []
    genuine_dir = CEDAR_DIR / "full_org"
    forged_dir = CEDAR_DIR / "full_forg"

    for d, label in [(genuine_dir, 1), (forged_dir, 0)]:
        if not d.exists():
            continue
        for f in sorted(d.glob("*.png")) + sorted(d.glob("*.jpg")):
            img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
            if img is not None:
                images.append(img)
                labels.append(label)
    return images, labels


def _render_stroke_signature(rng: np.random.Generator, distort: bool = False) -> np.ndarray:
    """
    Renders a synthetic pen-stroke-like signature using random Bezier-ish
    polylines, optionally distorted (simulating a forged/imitated stroke)
    with added jitter, different curvature, and stroke-width variance.
    """
    w, h = IMAGE_SIZE
    canvas = np.full((h, w), 255, dtype=np.uint8)

    n_strokes = rng.integers(3, 6)
    base_seed_points = rng.integers(low=[10, 10], high=[w - 10, h - 10], size=(6, 2))

    for _ in range(n_strokes):
        n_points = rng.integers(4, 8)
        idx = rng.choice(len(base_seed_points), size=n_points, replace=True)
        pts = base_seed_points[idx].astype(np.float64)

        if distort:
            jitter = rng.normal(0, 6, pts.shape)  # forged strokes are shakier
            pts += jitter
            thickness = int(rng.integers(1, 2))
        else:
            jitter = rng.normal(0, 2, pts.shape)  # genuine strokes are smoother
            pts += jitter
            thickness = int(rng.integers(2, 3))

        pts = pts.astype(np.int32)
        for i in range(len(pts) - 1):
            cv2.line(canvas, tuple(pts[i]), tuple(pts[i + 1]), color=0, thickness=thickness,
                      lineType=cv2.LINE_AA)

    if distort:
        # Slight affine warp so "forged" samples diverge structurally too,
        # mirroring how imitated signatures differ in proportion/slant.
        angle = rng.uniform(-8, 8)
        scale = rng.uniform(0.9, 1.1)
        m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, scale)
        canvas = cv2.warpAffine(canvas, m, (w, h), borderValue=255)

    return canvas


def _load_synthetic(n_genuine: int = 300, n_forged: int = 300, seed: int = 42
                     ) -> Tuple[List[np.ndarray], List[int]]:
    rng = np.random.default_rng(seed)
    images, labels = [], []

    for _ in range(n_genuine):
        images.append(_render_stroke_signature(rng, distort=False))
        labels.append(1)
    for _ in range(n_forged):
        images.append(_render_stroke_signature(rng, distort=True))
        labels.append(0)

    logger.info("Generated synthetic dataset: %d genuine, %d forged.", n_genuine, n_forged)
    return images, labels


def load_dataset(source: str = "auto") -> Tuple[List[np.ndarray], List[int]]:
    """
    source: "cedar" | "synthetic" | "auto"
        auto -> uses CEDAR if the folders exist and are non-empty, else synthetic.
    Returns grayscale images (not yet preprocessed) and integer labels
    (1 = genuine, 0 = forged).
    """
    if source in ("cedar", "auto"):
        images, labels = _load_cedar()
        if images:
            logger.info("Loaded CEDAR dataset: %d images.", len(images))
            return images, labels
        if source == "cedar":
            raise FileNotFoundError(
                f"CEDAR dataset not found at {CEDAR_DIR}. "
                "See dataset/README.md for download instructions."
            )
        logger.warning("CEDAR dataset not found — falling back to synthetic dataset.")

    return _load_synthetic()
