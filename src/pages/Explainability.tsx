import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { createSampleSignature, analyzeSignature, loadImage } from '../utils/signatureAnalysis';
import { VisualExplainabilityStudio } from '../components/VisualExplainabilityStudio';
import {
  Brain,
  Layers,
  Sliders,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Info,
  HelpCircle,
  FileCheck2,
  FileX2
} from 'lucide-react';

interface ExplainabilityProps {
  lastResult: AnalysisResult | null;
  onNavigateToDetect: () => void;
}

export const Explainability: React.FC<ExplainabilityProps> = ({
  lastResult,
  onNavigateToDetect,
}) => {
  const [activeResult, setActiveResult] = useState<AnalysisResult | null>(lastResult);
  const [loadingSample, setLoadingSample] = useState(false);
  const [activeSampleType, setActiveSampleType] = useState<'genuine' | 'forged'>('genuine');

  // Load sample signature explanation for instant exploration
  const handleLoadSample = async (type: 'genuine' | 'forged') => {
    setLoadingSample(true);
    setActiveSampleType(type);
    try {
      const dataUrl = createSampleSignature(type);
      const img = await loadImage(dataUrl);
      const res = await analyzeSignature(img, 'features', {
        forcedVerdict: type === 'genuine' ? 'Genuine' : 'Forged',
      });
      res.label = type === 'genuine' ? 'Genuine Reference Specimen' : 'Traced Forgery Specimen';
      setActiveResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSample(false);
    }
  };

  const result = activeResult || lastResult;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-3 border-b border-purple-900/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
            <span>🧠</span> Visual Explainability & Forensic Heatmap Studio
          </h2>
          <p className="text-sm text-purple-300/70 mt-1">
            Intuitive pixel-by-pixel SHAP heatmaps, split comparison curtains, and plain-English stroke forensics.
          </p>
        </div>

        {/* Instant Specimen Loader */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-300/60 font-semibold">Explore Demo:</span>
          <button
            onClick={() => handleLoadSample('genuine')}
            disabled={loadingSample}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSampleType === 'genuine' && activeResult
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-purple-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-950/40'
            }`}
          >
            <FileCheck2 size={13} />
            <span>Genuine Sample</span>
          </button>
          <button
            onClick={() => handleLoadSample('forged')}
            disabled={loadingSample}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSampleType === 'forged' && activeResult
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-purple-950/40 text-rose-300 border border-rose-500/30 hover:bg-rose-950/40'
            }`}
          >
            <FileX2 size={13} />
            <span>Forged Sample</span>
          </button>
        </div>
      </div>

      {/* If no result exists yet and user hasn't loaded demo */}
      {!result ? (
        <div className="fx-card p-12 text-center space-y-4 max-w-xl mx-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-900/30 border border-purple-600/30 flex items-center justify-center text-purple-400">
            <Brain size={32} />
          </div>
          <h3 className="text-lg font-bold text-white">No Prediction Loaded Yet</h3>
          <p className="text-xs text-purple-300/70 leading-relaxed">
            Run an analysis on the <strong>Signature Detection</strong> page first, or click either button above to explore the interactive visual explainability suite.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleLoadSample('genuine')}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30"
            >
              Load Interactive Demo Specimen
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Interactive Visual Explainability Studio */}
          <div className="fx-card p-6 border-2 border-purple-600/40">
            <VisualExplainabilityStudio
              result={result}
              title={`Auditing: ${result.label || result.filename || 'Signature Specimen'}`}
              subtitle="Inspect heatmap intensities, move the comparison curtain, or hover hotspots to understand the forensic basis."
            />
          </div>

          {/* Educational "How AI Forensics Works" Guide for Non-Technical Users */}
          <div className="fx-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-purple-400" />
              <h3 className="text-base font-bold text-white">
                How to Understand Signature Heatmaps (Non-Technical Guide)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-2">
                <span className="font-bold text-emerald-400 block uppercase tracking-wider text-[11px]">
                  1. Natural Fluidity (Genuine)
                </span>
                <p className="text-purple-200/80 leading-relaxed">
                  Real signers sign quickly using muscle memory. This produces smooth pen edges, consistent pressure, and rapid tapering at stroke terminations.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-2">
                <span className="font-bold text-rose-400 block uppercase tracking-wider text-[11px]">
                  2. Tracing Hesitation (Forged)
                </span>
                <p className="text-purple-200/80 leading-relaxed">
                  Someone copying a signature draws slowly. This causes microscopic pen wobbles ("tremors") and unnatural stops where they paused to check the original.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 space-y-2">
                <span className="font-bold text-fuchsia-400 block uppercase tracking-wider text-[11px]">
                  3. What Heatmaps Show
                </span>
                <p className="text-purple-200/80 leading-relaxed">
                  Red and warm yellow areas are where the AI looked closest to make its decision. If red highlights a jagged loop, that hesitation proved the forgery.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
