import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PredictionRecord } from '../types';
import { subscribePredictions } from '../services/firestoreService';
import { FileSearch, CheckCircle2, AlertTriangle, Activity, ChevronRight, HelpCircle } from 'lucide-react';

interface HomeDashboardProps {
  onNavigate: (tab: string) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    // 1. Subscribe to Firestore in real-time
    const unsubscribe = subscribePredictions(user?.id, user?.role === 'admin', (list) => {
      setPredictions(list);
      setLoading(false);
    });

    // 2. Initial fetch from API proxy fallback
    const url = user?.role === 'admin'
      ? '/api/predictions?role=admin'
      : `/api/predictions?userId=${user?.id}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0 && predictions.length === 0) {
          setPredictions(data);
          setLoading(false);
        }
      })
      .catch(console.error);

    return () => unsubscribe();
  }, [user]);

  const total = predictions.length;
  const genuineCount = predictions.filter((p) => p.prediction === 'Genuine').length;
  const forgedCount = predictions.filter((p) => p.prediction === 'Forged').length;
  const avgConfidence = total
    ? Math.round(predictions.reduce((acc, p) => acc + (p.confidence || 0), 0) / total)
    : 0;

  const firstName = user?.full_name ? user.full_name.split(' ')[0] : 'there';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-purple-900/20">
        <div>
          <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
            <span>✍️</span> Welcome back, {firstName} 👋
          </h2>
          <p className="text-sm text-purple-300/70 mt-1">
            Detect. Explain. Trust. &bull; Enterprise Offline Signature Verification &bull; Firestore Connected
          </p>
        </div>
        <button
          onClick={() => onNavigate('detection')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-lg shadow-purple-600/30 transition-all hover:scale-102"
        >
          <FileSearch size={18} />
          <span>New Analysis</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Analyses */}
        <div className="fx-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300/70">
              Total Analyses
            </span>
            <div className="p-2 rounded-lg bg-purple-900/30 text-purple-400">
              <Activity size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{total}</span>
            <span className="text-xs text-purple-300/60 font-medium">persisted</span>
          </div>
        </div>

        {/* Genuine */}
        <div className="fx-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300/70">
              Genuine Verified
            </span>
            <div className="p-2 rounded-lg bg-emerald-950/40 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400">{genuineCount}</span>
            {total > 0 && (
              <span className="text-xs text-emerald-300/60 font-medium">
                ({Math.round((genuineCount / total) * 100)}%)
              </span>
            )}
          </div>
        </div>

        {/* Forgery Detected */}
        <div className="fx-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/70">
              Forgery Detected
            </span>
            <div className="p-2 rounded-lg bg-rose-950/40 text-rose-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-400">{forgedCount}</span>
            {total > 0 && (
              <span className="text-xs text-rose-300/60 font-medium">
                ({Math.round((forgedCount / total) * 100)}%)
              </span>
            )}
          </div>
        </div>

        {/* Avg Confidence */}
        <div className="fx-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300/70">
              Avg. Confidence
            </span>
            <div className="p-2 rounded-lg bg-purple-900/30 text-purple-400">
              <Activity size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-200">{avgConfidence}%</span>
            <span className="text-xs text-purple-300/60 font-medium">accuracy index</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Visual split + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outcome Split & Quick Insight */}
        <div className="fx-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Outcome Distribution</h3>
            <p className="text-xs text-purple-300/60 mb-5">
              Historical Genuine vs. Forged ratio from Firestore
            </p>

            {total > 0 ? (
              <div className="space-y-4">
                <div className="h-4 w-full bg-purple-950/40 rounded-full overflow-hidden flex p-0.5 border border-purple-800/30">
                  <div
                    style={{ width: `${(genuineCount / total) * 100}%` }}
                    className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
                    title={`Genuine: ${genuineCount}`}
                  />
                  <div
                    style={{ width: `${(forgedCount / total) * 100}%` }}
                    className="h-full bg-rose-500 rounded-r-full transition-all duration-500"
                    title={`Forged: ${forgedCount}`}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-purple-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Genuine Signatures
                    </span>
                    <span className="font-bold text-emerald-400">{genuineCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-purple-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      Forged Signatures
                    </span>
                    <span className="font-bold text-rose-400">{forgedCount}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-purple-300/50 py-8 text-center">
                No analyses recorded yet in Firestore.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-purple-900/20 text-xs text-purple-300/70">
            Engine operates on 128×128 normalized pixel tensor inputs with SHAP TreeExplainer attributions.
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="fx-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white">Recent Activity</h3>
              <p className="text-xs text-purple-300/60">Live feed from Firestore</p>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {predictions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-purple-900/30 text-purple-300/60 text-xs">
                    <th className="pb-3 font-semibold">Specimen</th>
                    <th className="pb-3 font-semibold">Verdict</th>
                    <th className="pb-3 font-semibold">Confidence</th>
                    <th className="pb-3 font-semibold">Model</th>
                    <th className="pb-3 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/10">
                  {predictions.slice(0, 5).map((p) => {
                    const isForged = p.prediction === 'Forged';
                    return (
                      <tr key={p.id} className="hover:bg-purple-900/10 transition-colors">
                        <td className="py-3 font-medium text-purple-100 max-w-[170px]">
                          {p.label ? (
                            <div>
                              <span className="font-semibold text-white block truncate" title={p.label}>
                                {p.label}
                              </span>
                              <span className="text-[10px] text-purple-300/60 block truncate" title={p.image_filename}>
                                {p.image_filename}
                              </span>
                            </div>
                          ) : (
                            <span className="truncate block" title={p.image_filename}>
                              {p.image_filename}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              isForged
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {p.prediction}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-purple-200">
                          {p.confidence}%
                        </td>
                        <td className="py-3 text-xs text-purple-300/60 truncate max-w-[120px]">
                          {p.model_used}
                        </td>
                        <td className="py-3 text-xs text-purple-300/50 text-right">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-purple-300/50">
              No signatures checked yet. Head to <strong>Signature Detection</strong> to test an image!
            </div>
          )}
        </div>
      </div>

      {/* "What is ForgeXplain?" Collapsible Card */}
      <div className="fx-card p-5">
        <button
          onClick={() => setShowFaq(!showFaq)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-900/30 text-purple-400">
              <HelpCircle size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">What is ForgeXplain?</h4>
              <p className="text-xs text-purple-300/60">
                Understanding the offline signature forgery detection system
              </p>
            </div>
          </div>
          <ChevronRight
            size={18}
            className={`text-purple-400 transition-transform duration-200 ${
              showFaq ? 'rotate-90' : ''
            }`}
          />
        </button>

        {showFaq && (
          <div className="mt-4 pt-4 border-t border-purple-900/20 text-xs text-purple-200/80 leading-relaxed space-y-2">
            <p>
              ForgeXplain analyzes offline handwritten signature images using computer vision and machine learning (SVM + Random Forest ensemble) to classify them as <strong>Genuine</strong> or <strong>Forged</strong>, and explains every decision using SHAP (SHapley Additive exPlanations) so results are transparent and auditable rather than a black-box verdict.
            </p>
            <p>
              The system features two detection engines: <strong>Pixel Engine</strong> (Random Forest over 128×128 pixel tensors with SHAP heatmap overlays) and <strong>Feature Engine</strong> (23 geometric, Hu moments, density, and contour features), alongside bank-grade <strong>Writer-Dependent Signer Verification</strong> backed by persistent Firestore storage.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
