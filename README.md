# ✍️ ForgeXplain

**Explainable AI-Powered Offline Signature Forgery Detection System**

ForgeXplain classifies handwritten signature images as **Genuine** or **Forged** using OpenCV
preprocessing, engineered features, and an SVM + Random Forest ensemble — with every prediction
explained via SHAP (LIME fallback), so results are transparent and auditable.

---

## ✨ Features

- 🔐 Full auth: sign up, login, logout, forgot password (bcrypt hashing, email validation)
- 👥 Role-based access: **Admin** (manage users, view all history, retrain models) and **User**
- 🖼️ OpenCV preprocessing pipeline with step-by-step visualization
- 🧮 17+ engineered features: geometry, Hu Moments, density, contours, histogram
- 🤖 SVM + Random Forest, compared side-by-side (accuracy/precision/recall/F1/ROC/confusion matrix)
- 🧠 SHAP explainability (TreeExplainer/KernelExplainer) with automatic LIME fallback
- 📊 Modern Streamlit dashboard, light/dark mode, 8 pages
- 🗃️ Pluggable storage: local SQLite (zero setup) or Supabase (Postgres + Auth), one config flag
- 📄 Downloadable PDF report per prediction
- 🐳 Docker + docker-compose, AWS-deployment-ready

## 🗂️ Project Structure

```
ForgeXplain/
├── app.py                      # Streamlit entry point + routing
├── auth/                       # Sign up / login / logout / password reset
├── database/                   # DBInterface abstraction: local_store.py | supabase_client.py
├── preprocessing/               # OpenCV image pipeline
├── features/                   # Feature extraction (17+ features)
├── ml_models/                  # Training pipeline + predictor (joblib load/save)
├── explainability/              # SHAP + LIME fallback explainer
├── pages/                      # Streamlit pages (Home, Detection, Performance, etc.)
├── utils/                      # config, logging, PDF report generator
├── dataset/                    # CEDAR loader + synthetic fallback generator
├── trained_models/              # Saved .joblib models + metrics.json (generated)
├── reports/                    # Generated PDF reports (generated)
├── assets/                     # CSS, images
├── Dockerfile / docker-compose.yml
└── requirements.txt
```

## 🤖 Detection Engines

ForgeXplain ships with **two interchangeable detection engines**, switched via `ACTIVE_ENGINE` in `.env`:

- **`pixel` (default)** — uses your externally-trained `random_forest_model.joblib` +
  `label_encoder.joblib` (in `trained_models/`). Input: images resized to 128×128 RGB,
  normalized to [0,1], flattened (49,152 values) — matching the exact preprocessing from the
  notebook these were trained in. Explainability is a **SHAP pixel-importance heatmap**
  overlaid on the signature (since raw pixels don't have human-readable names).
- **`features`** — the in-app OpenCV + 23-engineered-feature pipeline (area, Hu Moments,
  contours, etc.) with SVM/Random Forest and named-feature SHAP/LIME explanations. Useful if
  you retrain on CEDAR later and want interpretable feature names instead of a heatmap.

Both engines share the same auth, database, history, and PDF-report code — only
`app_views/page_detection.py` and `app_views/page_explainability.py` branch on which one runs.

## 🚀 Quick Start (local)

```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                              # defaults to local SQLite storage

# Train the models (uses CEDAR if present in dataset/CEDAR/, else synthetic data)
python -m ml_models.train_pipeline

streamlit run app.py
```

Open http://localhost:8501. The **first account you sign up** is automatically made an admin.

## 🐳 Docker

```bash
docker compose up --build
```

Mount your real CEDAR dataset by placing it in `./dataset/CEDAR/full_org` and
`./dataset/CEDAR/full_forg` before building — the compose file already mounts `./dataset`
into the container.

## ☁️ AWS Deployment (outline)

1. Push the image to **ECR**: `docker build -t forgexplain . && docker push <ecr-repo>`
2. Run on **ECS Fargate** or **App Runner** with the container exposing port `8501`
3. Store `SUPABASE_URL` / `SUPABASE_KEY` / `SESSION_SECRET` in **AWS Secrets Manager**, injected
   as environment variables in the task definition
4. Put an **ALB** in front for TLS termination and a custom domain
5. For persistent trained models across deployments, use an **EFS** mount or S3 + a startup
   script that pulls `trained_models/` before the app starts

## 🗄️ Switching to Supabase

1. Create a Supabase project, run `database/supabase_schema.sql` in its SQL editor
2. In `.env`: set `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_KEY`
3. Restart the app — no code changes required (see `database/db_interface.py`)

## 📊 Using the Real CEDAR Dataset

By default the app trains on a synthetic, procedurally generated signature dataset so it runs
immediately with no downloads. To use real data:

1. Download the CEDAR Signature Dataset
2. Place it as `dataset/CEDAR/full_org/` (genuine) and `dataset/CEDAR/full_forg/` (forged)
3. Retrain: `python -m ml_models.train_pipeline` (auto-detects CEDAR when present)

See `dataset/README.md` for details, including how to add BHSig260/GPDS later.

## 🧪 Model Comparison

Metrics (accuracy, precision, recall, F1, confusion matrix, ROC/AUC) are computed automatically
during training and saved to `trained_models/model_metrics.json`, then rendered on the
**Model Performance** page.

## 🔒 Security Notes

- Passwords are bcrypt-hashed (local backend) or handled by Supabase Auth (never stored in plaintext)
- Set a strong, unique `SESSION_SECRET` in production
- Use the `supabase` backend with Row Level Security (already defined in `supabase_schema.sql`)
  for any real multi-user deployment — the local SQLite backend is intended for development/demo
