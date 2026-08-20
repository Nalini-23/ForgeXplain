"""
page_about.py
--------------
Static About page describing the system.
"""

import streamlit as st
from utils.config import APP_NAME, APP_VERSION
from utils.ui_helpers import render_page_header


def render():
    render_page_header("ℹ️", f"About {APP_NAME}", f"Version {APP_VERSION}")

    st.markdown("""
### What it does
ForgeXplain classifies offline handwritten signature images as **Genuine** or **Forged**
using classical computer vision (OpenCV) for preprocessing, engineered geometric/shape/texture
features, and an SVM + Random Forest ensemble for classification — with every prediction backed
by a SHAP (or LIME fallback) explanation.

### Pipeline
1. **Preprocessing** — resize, grayscale, Gaussian blur, adaptive threshold, denoise, normalize
2. **Feature Extraction** — area, perimeter, aspect ratio, Hu Moments, contour stats, pixel
   density, histogram features
3. **Classification** — SVM (RBF kernel) and Random Forest, compared side-by-side
4. **Explainability** — SHAP feature attribution (TreeExplainer / KernelExplainer), LIME fallback
5. **Reporting** — downloadable PDF report per prediction

### Dataset
Trained on the **CEDAR Signature Dataset** by default; architecture supports adding
**BHSig260** or **GPDS** without code changes (see `dataset/README.md`).

### Tech Stack
Streamlit · Python 3.11 · Scikit-learn · OpenCV · SHAP/LIME · Supabase · Docker
""")
