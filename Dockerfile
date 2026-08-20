# ForgeXplain - production-ready Docker image
FROM python:3.11-slim

# System dependencies required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure runtime directories exist (also created at import-time, this is belt-and-suspenders)
RUN mkdir -p trained_models reports logs dataset/synthetic

# NOTE: trained_models/ ships pre-trained on the real CEDAR dataset (SVM ~86.4%,
# Random Forest ~91.5% accuracy) and is copied in via `COPY . .` above.
# Do NOT auto-retrain here: without dataset/CEDAR mounted, train_pipeline.py
# falls back to a synthetic, trivially-separable dataset that trains to a
# meaningless ~100% accuracy. If you want to retrain on real data, mount
# dataset/CEDAR/ and run `python -m ml_models.train_pipeline` manually.

EXPOSE 8501

HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health || exit 1

ENTRYPOINT ["streamlit", "run", "app.py", \
            "--server.port=8501", \
            "--server.address=0.0.0.0", \
            "--server.headless=true"]
