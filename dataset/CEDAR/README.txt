The raw CEDAR training images (2640 files, ~246MB) are excluded from this
package to keep it lightweight, since they are only needed for RETRAINING,
not for running the app.

The app runs fine as-is using the already-trained models in
trained_models/ (SVM 86.4% accuracy, Random Forest 91.5% accuracy).

If you need to retrain from scratch, re-download CEDAR and place images here as:
  dataset/CEDAR/full_org/original_*.png
  dataset/CEDAR/full_forg/forgeries_*.png
Then run: python -m ml_models.train_pipeline
