import React from 'react';
import { Info, Layers, Database, Cpu, ShieldCheck } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="pb-3 border-b border-purple-900/20">
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
          <span>ℹ️</span> About ForgeXplain
        </h2>
        <p className="text-sm text-purple-300/70 mt-1">
          Version 1.0.0 &bull; Explainable AI-Powered Offline Signature Forgery Detection System
        </p>
      </div>

      {/* Overview Card */}
      <div className="fx-card p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck size={18} className="text-purple-400" />
          Mission & Core Architecture
        </h3>
        <p className="text-sm text-purple-200/90 leading-relaxed">
          ForgeXplain classifies offline handwritten signature images as <strong>Genuine</strong> or <strong>Forged</strong> using classical computer vision for preprocessing, engineered geometric/shape/texture features, and an SVM + Random Forest ensemble for classification &mdash; with every prediction backed by a SHAP (SHapley Additive exPlanations) visual heatmap and forensic stroke metrics so results are transparent, auditable, and court-ready.
        </p>
      </div>

      {/* 5-Stage Pipeline */}
      <div className="fx-card p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Layers size={18} className="text-purple-400" />
          End-to-End Verification Pipeline
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-1.5">
            <div className="font-bold text-purple-200">1. Computer Vision Preprocessing</div>
            <p className="text-purple-300/70 leading-relaxed">
              Auto-detects signature regions in documents or cheques, applies adaptive Otsu thresholding, binarization, noise filtering, and normalizes input to 128&times;128 tensor matrices.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-1.5">
            <div className="font-bold text-purple-200">2. Engineered Feature Extraction</div>
            <p className="text-purple-300/70 leading-relaxed">
              Computes 23 biometric features: Hu Moment invariants (translation/scale/rotation invariant), pixel density, aspect ratio, solidity, and contour perimeter curvature.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-1.5">
            <div className="font-bold text-purple-200">3. Hybrid Ensemble Classification</div>
            <p className="text-purple-300/70 leading-relaxed">
              Runs Random Forest and RBF Kernel SVM classifiers side-by-side, evaluating tree voting margins and hyperplane distance for robust confidence scoring.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-1.5">
            <div className="font-bold text-purple-200">4. SHAP Explainability & Heatmaps</div>
            <p className="text-purple-300/70 leading-relaxed">
              TreeExplainer computes exact Shapley feature attributions, rendering pixel-level heatmaps that visually pinpoint tremor, pen hesitations, and velocity discontinuities.
            </p>
          </div>
        </div>
      </div>

      {/* Dataset & Tech Stack */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="fx-card p-6 space-y-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Database size={18} className="text-purple-400" />
            Dataset & Training Benchmarks
          </h3>
          <p className="text-xs text-purple-300/80 leading-relaxed">
            Calibrated on the <strong>CEDAR Signature Dataset</strong> (Center of Excellence for Document Analysis and Recognition). The extensible architecture supports integrating <strong>BHSig260</strong> and <strong>GPDS</strong> benchmark datasets without modifying core model pipelines.
          </p>
        </div>

        <div className="fx-card p-6 space-y-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu size={18} className="text-purple-400" />
            Technology Stack
          </h3>
          <p className="text-xs text-purple-300/80 leading-relaxed">
            React 19 &bull; Vite &bull; TypeScript &bull; Tailwind CSS v4 &bull; Node.js Express Backend &bull; Client/Server CV Preprocessing &bull; SHAP Explainability Engine &bull; In-Memory Data Layer.
          </p>
        </div>
      </div>
    </div>
  );
};
