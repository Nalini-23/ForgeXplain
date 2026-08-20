"""
calibrate_similarity_threshold.py
------------------------------------
Picks the match/no-match threshold used by verification/signer_verifier.py.

Why synthetic data: proper calibration should use real *per-writer*
distances — e.g. CEDAR's per-writer folders (writer 1 signing 24 times) —
to measure "how similar are two genuine signatures from the SAME person"
vs "how similar is an impostor's signature to that person's template".
The raw CEDAR images aren't bundled with this app (kept out to stay
lightweight — see dataset/CEDAR/README.txt), so this script instead
generates many synthetic "identities" (a persistent base stroke pattern
signed several times with small natural jitter) and measures the same
two distributions on those, using the real trained scaler so the numbers
are on the same footing as production. If real CEDAR images are added
back later, re-run calibration on real per-writer data for a more
representative threshold — see README note below.

Method: Youden's J statistic (maximize TPR - FPR) over candidate
thresholds, which is a standard, defensible way to pick an operating
point from two overlapping score distributions without hand-picking
a number.

Run: python -m ml_models.calibrate_similarity_threshold
"""

import json
import joblib
import numpy as np
import cv2

from utils.config import IMAGE_SIZE, SCALER_PATH, SIMILARITY_THRESHOLD_PATH, RANDOM_STATE
from verification.signer_verifier import SignerVerifier
from utils.logger import get_logger

logger = get_logger(__name__)


def _make_identity(rng: np.random.Generator) -> dict:
    """Creates a persistent 'identity': a fixed stroke plan (which points,
    in which order, how many strokes) — this is what stays constant
    between repeat signings by the same person, analogous to a real
    person's consistent letter shapes and stroke order."""
    w, h = IMAGE_SIZE
    base_points = rng.integers(low=[10, 10], high=[w - 10, h - 10], size=(6, 2))
    n_strokes = int(rng.integers(3, 6))
    stroke_plan = [rng.choice(len(base_points), size=int(rng.integers(4, 8)), replace=True)
                   for _ in range(n_strokes)]
    return {"base_points": base_points, "stroke_plan": stroke_plan}


def _render_identity_signature(rng: np.random.Generator, identity: dict,
                                jitter_std: float = 1.0) -> np.ndarray:
    """Renders one signing instance of a persistent identity. Only small
    positional jitter and stroke thickness vary between repeats — the
    stroke plan itself (what a real person's muscle memory keeps
    consistent) stays fixed, which is what makes 'genuine' scores
    meaningfully tighter than 'impostor' scores."""
    w, h = IMAGE_SIZE
    canvas = np.full((h, w), 255, dtype=np.uint8)
    base_points = identity["base_points"]

    for idx in identity["stroke_plan"]:
        pts = base_points[idx].astype(np.float64)
        pts += rng.normal(0, jitter_std, pts.shape)
        pts = pts.astype(np.int32)
        thickness = int(rng.integers(2, 3))
        for i in range(len(pts) - 1):
            cv2.line(canvas, tuple(pts[i]), tuple(pts[i + 1]), color=0,
                      thickness=thickness, lineType=cv2.LINE_AA)
    return canvas


def _to_bgr(gray: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def calibrate(n_identities: int = 60, repeats_per_identity: int = 5, seed: int = RANDOM_STATE):
    rng = np.random.default_rng(seed)
    w, h = IMAGE_SIZE
    scaler = joblib.load(SCALER_PATH)
    verifier = SignerVerifier(scaler=scaler)

    identities = []
    for _ in range(n_identities):
        identity = _make_identity(rng)
        samples = [_render_identity_signature(rng, identity) for _ in range(repeats_per_identity)]
        identities.append(samples)

    genuine_scores, impostor_scores = [], []

    for i, samples in enumerate(identities):
        bgr_samples = [_to_bgr(s) for s in samples]
        # Enroll on the first 3 "signings", test remaining 2 as genuine queries.
        template = verifier.build_template(bgr_samples[:3])
        for query in bgr_samples[3:]:
            q_vec = verifier.extract_raw_vector(query)
            genuine_scores.append(verifier.similarity(template, q_vec))

        # Impostor pairs: this identity's template vs. a few OTHER identities' queries.
        other_idxs = rng.choice([j for j in range(len(identities)) if j != i],
                                 size=min(3, len(identities) - 1), replace=False)
        for j in other_idxs:
            impostor_query = _to_bgr(identities[j][0])
            q_vec = verifier.extract_raw_vector(impostor_query)
            impostor_scores.append(verifier.similarity(template, q_vec))

    genuine_scores = np.array(genuine_scores)
    impostor_scores = np.array(impostor_scores)

    candidates = np.linspace(0.0, 1.0, 401)
    best_thr, best_j = 0.9, -1.0
    for thr in candidates:
        tpr = float(np.mean(genuine_scores >= thr))
        fpr = float(np.mean(impostor_scores >= thr))
        j = tpr - fpr
        if j > best_j:
            best_j, best_thr = j, thr

    genuine_accept_rate = float(np.mean(genuine_scores >= best_thr))
    impostor_reject_rate = float(np.mean(impostor_scores < best_thr))

    result = {
        "threshold": round(float(best_thr), 4),
        "method": "youden_j_synthetic_identities",
        "n_identities": n_identities,
        "repeats_per_identity": repeats_per_identity,
        "genuine_score_mean": round(float(genuine_scores.mean()), 4),
        "genuine_score_min": round(float(genuine_scores.min()), 4),
        "impostor_score_mean": round(float(impostor_scores.mean()), 4),
        "impostor_score_max": round(float(impostor_scores.max()), 4),
        "genuine_accept_rate_at_threshold": round(genuine_accept_rate, 4),
        "impostor_reject_rate_at_threshold": round(impostor_reject_rate, 4),
        "note": ("Calibrated on synthetic identities (real CEDAR per-writer images "
                 "are not bundled with this package). Re-run on real per-writer data "
                 "for production use."),
    }

    with open(SIMILARITY_THRESHOLD_PATH, "w") as f:
        json.dump(result, f, indent=2)

    logger.info("Calibration complete: threshold=%.3f (genuine accept=%.1f%%, impostor reject=%.1f%%)",
                best_thr, genuine_accept_rate * 100, impostor_reject_rate * 100)
    return result


if __name__ == "__main__":
    res = calibrate()
    print(json.dumps(res, indent=2))
