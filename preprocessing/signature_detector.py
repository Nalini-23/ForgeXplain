"""
signature_detector.py
------------------------
Locates and crops the signature region out of a larger uploaded image
(e.g. a full bank cheque or document photo), so the classifier only ever
sees the signature itself — not surrounding printed text, boxes, or
document background.

Approach: signatures are dense, connected clusters of dark ink strokes.
Printed text on a cheque tends to be small, evenly spaced, and separated
into many tiny contours; a signature tends to form fewer, larger,
overlapping contours concentrated in one region. We:

    1. Threshold the image to isolate all dark ink (text + signature).
    2. Group nearby ink into "blobs" via dilation (merges pen strokes that
       are part of the same signature into one connected region, while
       leaving printed text as smaller, separate blobs).
    3. Score each blob by area × stroke-density, and pick the best one as
       "most likely the signature".
    4. Crop to that region with padding.

If the image is already a tight signature-only crop (no surrounding
document), the whole ink area is naturally selected as one blob, so this
is safe to always run — it doesn't break existing signature-only uploads.
"""

import cv2
import numpy as np
from typing import Tuple, Optional
from utils.logger import get_logger

logger = get_logger(__name__)


class SignatureDetector:
    def detect_and_crop(self, image_bgr: np.ndarray, padding: int = 15) -> Tuple[np.ndarray, bool]:
        """
        Returns (cropped_image, was_cropped).
        was_cropped=False means the detector fell back to the full original
        image (e.g. nothing usable was found) — caller can inform the user.
        """
        cropped, was_cropped, _box = self.detect_and_crop_with_box(image_bgr, padding)
        return cropped, was_cropped

    def detect_and_crop_with_box(self, image_bgr: np.ndarray, padding: int = 15
                                  ) -> Tuple[np.ndarray, bool, Optional[Tuple[int, int, int, int]]]:
        """
        Same as detect_and_crop, but also returns the padded (x0, y0, x1, y1)
        box in original-image pixel coordinates — so a caller can pre-fill
        an interactive cropper with this as a *suggestion* rather than
        silently trusting it, since this heuristic isn't always right on
        messy real-world document photos.
        """
        try:
            if self._looks_like_signature_only(image_bgr):
                # Already an isolated signature (no surrounding document) —
                # use the full image untouched rather than hunting for a
                # sub-region inside it.
                return image_bgr, False, None
            box = self._find_signature_box(image_bgr)
        except Exception as e:
            logger.warning("Signature detection failed, using full image: %s", e)
            return image_bgr, False, None

        if box is None:
            return image_bgr, False, None

        x, y, w, h = box
        H, W = image_bgr.shape[:2]
        x0 = max(0, x - padding)
        y0 = max(0, y - padding)
        x1 = min(W, x + w + padding)
        y1 = min(H, y + h + padding)

        cropped = image_bgr[y0:y1, x0:x1]
        if cropped.size == 0:
            return image_bgr, False, None

        # If the "crop" is basically the whole image anyway (e.g. input was
        # already a tight signature scan), don't bother reporting it as cropped.
        was_meaningfully_cropped = (cropped.shape[0] * cropped.shape[1]) < 0.85 * (H * W)
        return cropped, was_meaningfully_cropped, (x0, y0, x1, y1)

    def _looks_like_signature_only(self, image_bgr: np.ndarray) -> bool:
        """
        Decide whether the uploaded image is *already* just a signature
        (no surrounding document/cheque) so we should skip cropping
        entirely and use it as-is.

        A bare signature scan has ink spread fairly evenly across most of
        the frame with essentially one connected stroke cluster and little
        or no printed structure (ruled lines, boxes, dense text blocks)
        away from that cluster. A cheque/document photo instead has a
        single small ink cluster (the signature) surrounded by large
        stretches of near-empty background plus other printed elements.
        """
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        H, W = gray.shape
        image_area = H * W

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Use a smaller merge kernel than the document case so we don't
        # artificially fuse the signature with unrelated print — we just
        # want to know how much of the frame the ink occupies overall and
        # how many separate clusters it forms.
        kernel_w = max(9, W // 60)
        kernel_h = max(5, H // 90)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
        dilated = cv2.dilate(binary, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return False

        # Bounding box of ALL ink combined — how much of the frame does the
        # ink, taken together, actually span?
        xs0, ys0, xs1, ys1 = W, H, 0, 0
        significant_blobs = 0
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            area = w * h
            if area < 0.0015 * image_area:
                continue  # speck/noise
            significant_blobs += 1
            xs0, ys0 = min(xs0, x), min(ys0, y)
            xs1, ys1 = max(xs1, x + w), max(ys1, y + h)

        if significant_blobs == 0:
            return False

        overall_box_area = max(0, xs1 - xs0) * max(0, ys1 - ys0)
        coverage = overall_box_area / image_area

        # A bare signature crop: the ink (as a whole) fills most of the
        # frame, and there aren't many stray disconnected printed elements
        # scattered outside a tight cluster. A document photo has the
        # signature occupying a much smaller fraction of the whole page,
        # even if the signature itself is "big" pixel-wise.
        return coverage > 0.55 and significant_blobs <= 4

    def _find_signature_box(self, image_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        H, W = gray.shape

        # Isolate dark ink on a lighter background.
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Merge nearby strokes into connected blobs. Kernel size scales with
        # image size so this works on both small crops and large document photos.
        kernel_w = max(15, W // 40)
        kernel_h = max(8, H // 60)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
        dilated = cv2.dilate(binary, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        best_box, best_score = None, -1.0
        image_area = H * W

        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            area = w * h
            if area < 0.002 * image_area or area > 0.6 * image_area:
                continue  # too small (noise/dot) or too large (whole page)

            aspect = w / max(h, 1)
            if aspect < 1.0 or aspect > 12.0:
                continue  # signatures are wider than tall, but not a full text line/table

            # Ink density inside this blob's own binary region — a real
            # signature has moderate, fairly continuous stroke coverage.
            roi = binary[y:y + h, x:x + w]
            density = float(np.count_nonzero(roi)) / max(area, 1)
            if density < 0.03 or density > 0.6:
                continue

            # Solidity: how much of the blob's convex hull is actually
            # filled. Printed text (dates, payee lines etc.), even after
            # dilation, tends to form a near-solid rectangular blob
            # (solidity close to 1). A cursive signature has loops and
            # gaps, so it fills much less of its own convex hull. Lower
            # solidity -> more signature-like -> boost the score.
            hull = cv2.convexHull(c)
            hull_area = cv2.contourArea(hull) or 1.0
            solidity = cv2.contourArea(c) / hull_area
            solidity_factor = max(0.2, 1.4 - solidity)

            # Position bias: on cheques/forms, signatures are placed in the
            # lower portion of the document far more often than dates or
            # header fields (which sit near the top). Mildly favor blobs
            # whose vertical center sits in the lower 70% of the image;
            # penalize anything in the top 20% (typical date/header zone).
            center_y_frac = (y + h / 2) / H
            if center_y_frac < 0.15:
                position_factor = 0.3
            elif center_y_frac < 0.35:
                position_factor = 0.7
            else:
                position_factor = 1.0

            # NOTE: density is used only as a filter above, not as a score
            # multiplier — dense printed text (e.g. a date block) would
            # otherwise consistently outscore a thin-penned signature just
            # for being "more filled in", which is the opposite of what we want.
            score = area * solidity_factor * position_factor
            if score > best_score:
                best_score = score
                best_box = (x, y, w, h)

        return best_box
