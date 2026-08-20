# Dataset

## CEDAR Signature Dataset (primary)

Download the CEDAR dataset (55 signers, 24 genuine + 24 forged each) and place it as:

```
dataset/CEDAR/
    full_org/     # genuine signatures, e.g. original_1_1.png
    full_forg/    # forged signatures,  e.g. forgeries_1_1.png
```

The dataset is commonly distributed via academic mirrors / Kaggle ("CEDAR Signature Dataset").
Search "CEDAR signature dataset download" — it is not publicly redistributable from this
codebase, so you'll need to fetch it yourself and drop it into the folder structure above.

Once present, `dataset/dataset_loader.py` (`load_dataset(source="cedar")`, or `"auto"`) will
pick it up automatically — no other code changes needed.

## Adding BHSig260 or GPDS later

Add a `_load_bhsig260()` / `_load_gpds()` function in `dataset_loader.py` that returns
`(images: List[np.ndarray], labels: List[int])` with the same 1=genuine/0=forged convention,
then wire it into `load_dataset()`. Feature extraction, training, and the UI are all
dataset-agnostic and require zero changes.

## Synthetic fallback (used automatically if CEDAR isn't present)

`dataset_loader.py` generates procedurally-rendered pen-stroke signatures (smooth strokes for
"genuine", jittered/warped strokes for "forged") so the full pipeline — preprocessing, feature
extraction, training, evaluation, SHAP explainability — works out of the box for development,
demos, and grading without requiring the real dataset. Retrain on CEDAR before relying on this
for any real accuracy claims.
