import React, { useEffect, useState } from 'react';
import { ModelMetrics } from '../types';
import { BarChart3, Edit3, Check, Layers, Cpu, Clock, Award, Activity } from 'lucide-react';

export const ModelPerformance: React.FC = () => {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<'svm' | 'random_forest'>('random_forest');
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<{
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
  }>({
    accuracy: 91.48,
    precision: 91.32,
    recall: 91.67,
    f1_score: 91.49,
  });

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/metrics');
      const data = await res.json();
      setMetrics(data);
      if (data.random_forest) {
        setEditValues({
          accuracy: +(data.random_forest.accuracy * 100).toFixed(2),
          precision: +(data.random_forest.precision * 100).toFixed(2),
          recall: +(data.random_forest.recall * 100).toFixed(2),
          f1_score: +(data.random_forest.f1_score * 100).toFixed(2),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveMetrics = async () => {
    if (!metrics) return;
    const updated = {
      ...metrics,
      [activeTab]: {
        ...metrics[activeTab],
        accuracy: editValues.accuracy / 100,
        precision: editValues.precision / 100,
        recall: editValues.recall / 100,
        f1_score: editValues.f1_score / 100,
      },
    };
    try {
      await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setMetrics(updated);
      setEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  if (!metrics) {
    return <div className="p-8 text-center text-purple-300">Loading model benchmarks...</div>;
  }

  const current = metrics[activeTab];

  // Pipeline stage cards
  const stages = [
    { icon: '🧹', label: '1. Preprocessing' },
    { icon: '🧩', label: '2. Feature Extraction' },
    { icon: '📐', label: '3. SVM' },
    { icon: '🌲', label: '4. Random Forest' },
    { icon: '✅', label: '5. Prediction & SHAP' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-3 border-b border-purple-900/20">
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
          <span>📊</span> Model Performance & Evaluation
        </h2>
        <p className="text-sm text-purple-300/70 mt-1">
          Comparison of trained classifiers on the held-out CEDAR / synthetic test dataset.
        </p>
      </div>

      {/* Hybrid ML Model Architecture Banner */}
      <div className="fx-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">Hybrid Ensemble Machine Learning</h3>
          <p className="text-xs text-purple-300/70 mt-1 max-w-2xl leading-relaxed">
            Our ensemble approach combines pixel-level pattern recognition with a Random Forest classifier and an RBF Support Vector Machine, layered with SHAP explainability so every verdict comes with transparent forensic attribution rather than an opaque score.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          {stages.map((stg) => (
            <div
              key={stg.label}
              className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-800/30 text-center"
            >
              <div className="text-2xl">{stg.icon}</div>
              <div className="text-[11px] font-bold text-purple-200/90 mt-1.5">{stg.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Table: Models compared side-by-side */}
      <div className="fx-card p-6">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Activity size={16} className="text-purple-400" />
          Held-Out Test Set Benchmark Summary
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-purple-900/30 text-purple-300/60 text-xs">
                <th className="pb-3 font-semibold">Model Architecture</th>
                <th className="pb-3 font-semibold">Accuracy</th>
                <th className="pb-3 font-semibold">Precision</th>
                <th className="pb-3 font-semibold">Recall</th>
                <th className="pb-3 font-semibold">F1 Score</th>
                <th className="pb-3 font-semibold">ROC AUC</th>
                <th className="pb-3 font-semibold text-right">Train Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-900/10">
              <tr className="hover:bg-purple-900/10 transition-colors">
                <td className="py-3 font-bold text-purple-100 flex items-center gap-2">
                  <span>🌲</span> Random Forest (Ensemble)
                </td>
                <td className="py-3 font-semibold text-emerald-400">
                  {(metrics.random_forest.accuracy * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-200">
                  {(metrics.random_forest.precision * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-200">
                  {(metrics.random_forest.recall * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-200 font-semibold">
                  {(metrics.random_forest.f1_score * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-300 font-semibold">
                  {metrics.random_forest.roc_curve.auc.toFixed(3)}
                </td>
                <td className="py-3 text-purple-300/60 text-right text-xs">
                  {metrics.random_forest.train_time_sec?.toFixed(2) || '1.36'}s
                </td>
              </tr>
              <tr className="hover:bg-purple-900/10 transition-colors">
                <td className="py-3 font-bold text-purple-100 flex items-center gap-2">
                  <span>📐</span> Support Vector Machine (RBF)
                </td>
                <td className="py-3 font-semibold text-purple-300">
                  {(metrics.svm.accuracy * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-200">
                  {(metrics.svm.precision * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-200">
                  {(metrics.svm.recall * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-200 font-semibold">
                  {(metrics.svm.f1_score * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-purple-300 font-semibold">
                  {metrics.svm.roc_curve.auc.toFixed(3)}
                </td>
                <td className="py-3 text-purple-300/60 text-right text-xs">
                  {metrics.svm.train_time_sec?.toFixed(2) || '0.36'}s
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Tabs & Detailed Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex rounded-xl bg-purple-950/60 p-1 border border-purple-800/30">
            <button
              onClick={() => setActiveTab('random_forest')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'random_forest'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-purple-300/60 hover:text-white'
              }`}
            >
              Random Forest Details
            </button>
            <button
              onClick={() => setActiveTab('svm')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'svm'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-purple-300/60 hover:text-white'
              }`}
            >
              Support Vector Machine Details
            </button>
          </div>

          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 hover:text-white bg-purple-900/30 border border-purple-700/30 flex items-center gap-1.5 transition-colors"
          >
            <Edit3 size={14} />
            <span>{editing ? 'Cancel' : 'Edit Metrics'}</span>
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="fx-card p-5 border border-purple-500/40 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
              Update {activeTab.replace('_', ' ').toUpperCase()} Benchmark Parameters
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-purple-300/70 font-semibold">Accuracy (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.accuracy}
                  onChange={(e) => setEditValues({ ...editValues, accuracy: parseFloat(e.target.value) })}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-purple-750 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-purple-300/70 font-semibold">Precision (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.precision}
                  onChange={(e) => setEditValues({ ...editValues, precision: parseFloat(e.target.value) })}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-purple-750 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-purple-300/70 font-semibold">Recall (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.recall}
                  onChange={(e) => setEditValues({ ...editValues, recall: parseFloat(e.target.value) })}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-purple-750 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-purple-300/70 font-semibold">F1 Score (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.f1_score}
                  onChange={(e) => setEditValues({ ...editValues, f1_score: parseFloat(e.target.value) })}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-purple-750 px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSaveMetrics}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Save Benchmark Metrics</span>
              </button>
            </div>
          </div>
        )}

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="fx-card p-5">
            <span className="text-xs text-purple-300/60 font-semibold uppercase">Accuracy</span>
            <div className="text-3xl font-extrabold text-emerald-400 mt-1">
              {(current.accuracy * 100).toFixed(2)}%
            </div>
          </div>
          <div className="fx-card p-5">
            <span className="text-xs text-purple-300/60 font-semibold uppercase">Precision</span>
            <div className="text-3xl font-extrabold text-purple-200 mt-1">
              {(current.precision * 100).toFixed(2)}%
            </div>
          </div>
          <div className="fx-card p-5">
            <span className="text-xs text-purple-300/60 font-semibold uppercase">Recall</span>
            <div className="text-3xl font-extrabold text-purple-200 mt-1">
              {(current.recall * 100).toFixed(2)}%
            </div>
          </div>
          <div className="fx-card p-5">
            <span className="text-xs text-purple-300/60 font-semibold uppercase">F1 Score</span>
            <div className="text-3xl font-extrabold text-fuchsia-300 mt-1">
              {(current.f1_score * 100).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Confusion Matrix & ROC Curve */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Confusion Matrix */}
          <div className="fx-card p-6">
            <h4 className="text-sm font-bold text-white mb-3">Confusion Matrix</h4>
            <div className="overflow-hidden rounded-xl border border-purple-900/30">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr className="bg-purple-950/60 text-purple-300">
                    <th className="p-3"></th>
                    <th className="p-3 font-semibold">Predicted: Forged</th>
                    <th className="p-3 font-semibold">Predicted: Genuine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20">
                  <tr>
                    <td className="p-3 font-semibold text-purple-300 bg-purple-950/30">
                      Actual: Forged
                    </td>
                    <td className="p-3 font-bold text-emerald-400 bg-emerald-950/20">
                      {current.confusion_matrix[0][0]} (True Neg)
                    </td>
                    <td className="p-3 font-bold text-rose-400 bg-rose-950/20">
                      {current.confusion_matrix[0][1]} (False Pos)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-purple-300 bg-purple-950/30">
                      Actual: Genuine
                    </td>
                    <td className="p-3 font-bold text-rose-400 bg-rose-950/20">
                      {current.confusion_matrix[1][0]} (False Neg)
                    </td>
                    <td className="p-3 font-bold text-emerald-400 bg-emerald-950/20">
                      {current.confusion_matrix[1][1]} (True Pos)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ROC Curve Graph */}
          <div className="fx-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-white">ROC Curve</h4>
              <span className="text-xs font-bold text-purple-300 px-2.5 py-0.5 rounded-full bg-purple-950 border border-purple-700/30">
                AUC = {current.roc_curve.auc.toFixed(3)}
              </span>
            </div>

            <div className="h-44 w-full bg-black/40 rounded-xl border border-purple-900/30 p-3 relative flex items-end">
              <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                {/* Diagonal baseline */}
                <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(139, 92, 246, 0.25)" strokeDasharray="3,3" />

                {/* ROC curve path */}
                {(() => {
                  const points = current.roc_curve.fpr.map((fpr, i) => {
                    const tpr = current.roc_curve.tpr[i];
                    return `${fpr * 100},${100 - (tpr * 100)}`;
                  });
                  return (
                    <polyline
                      fill="none"
                      stroke="#A855F7"
                      strokeWidth="2.5"
                      points={points.join(' ')}
                    />
                  );
                })()}
              </svg>
            </div>
            <div className="flex justify-between text-[11px] text-purple-400/60 mt-2 px-1">
              <span>False Positive Rate (0.0 &rarr; 1.0)</span>
              <span>True Positive Rate (0.0 &rarr; 1.0)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
