import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PredictionRecord } from '../types';
import { subscribePredictions, deletePredictionFromFirestore } from '../services/firestoreService';
import { History, Download, Trash2, Search, Filter, ChevronDown, CheckCircle2, AlertTriangle, Cloud, Tag } from 'lucide-react';

export const PredictionHistory: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPred, setFilterPred] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Live subscription to Firestore
    const unsubscribe = subscribePredictions(user?.id, user?.role === 'admin', (list) => {
      setRecords(list);
      setLoading(false);
    });

    // 2. Initial fetch from API proxy fallback
    const url = user?.role === 'admin'
      ? '/api/predictions?role=admin'
      : `/api/predictions?userId=${user?.id}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0 && records.length === 0) {
          setRecords(data);
          setLoading(false);
        }
      })
      .catch(() => {});

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    try {
      await deletePredictionFromFirestore(id);
    } catch {
      // Local fallback
      try {
        await fetch(`/api/predictions/${id}`, { method: 'DELETE' });
      } catch {}
    }
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Date', 'Label', 'Filename', 'Verdict', 'Confidence', 'Model', 'Latency_ms', 'Explanation'];
    const rows = filteredRecords.map((r) => [
      r.id,
      r.created_at,
      `"${(r.label || '').replace(/"/g, '""')}"`,
      r.image_filename,
      r.prediction,
      r.confidence,
      r.model_used,
      r.prediction_time_ms,
      `"${r.explanation_summary.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'forgexplain_prediction_history.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = records.filter((r) => {
    const matchesPred = filterPred === 'all' || r.prediction.toLowerCase().includes(filterPred.toLowerCase());
    const matchesSearch = r.image_filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.label && r.label.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          r.model_used.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.prediction.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesPred && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-3 border-b border-purple-900/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
            <span>🕘</span> Prediction History & Audit Trail
          </h2>
          <p className="text-sm text-purple-300/70 mt-1 flex items-center gap-1.5">
            <Cloud size={14} className="text-purple-400" />
            <span>Persisted in real-time in Google Cloud Firestore with custom specimen labels.</span>
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={filteredRecords.length === 0}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 border border-purple-700/40 flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          <span>Export as CSV</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="fx-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-sm bg-black/40 rounded-xl px-3 py-1.5 border border-purple-900/30">
          <Search size={15} className="text-purple-400" />
          <input
            type="text"
            placeholder="Search specimen label, filename, or model..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-purple-400/50 focus:outline-hidden w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={15} className="text-purple-400" />
          <span className="text-xs text-purple-300/70 font-semibold">Verdict:</span>
          <select
            value={filterPred}
            onChange={(e) => setFilterPred(e.target.value)}
            className="bg-[#1C1830] border border-purple-700/40 rounded-lg px-2.5 py-1 text-xs text-purple-200 focus:outline-hidden"
          >
            <option value="all">All Verdicts</option>
            <option value="genuine">Genuine Only</option>
            <option value="forged">Forged Only</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="fx-card p-6">
        {loading ? (
          <div className="p-8 text-center text-purple-300/60 text-sm">Loading historical logs from Firestore...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-purple-300/50 text-sm">
            No prediction records found in Firestore. Head to <strong>Signature Detection</strong> to run an analysis!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-purple-900/30 text-purple-300/60 text-xs">
                  <th className="pb-3 font-semibold">Timestamp</th>
                  <th className="pb-3 font-semibold">Label / Description</th>
                  <th className="pb-3 font-semibold">Specimen File</th>
                  <th className="pb-3 font-semibold">Verdict</th>
                  <th className="pb-3 font-semibold">Confidence</th>
                  <th className="pb-3 font-semibold">Model Used</th>
                  <th className="pb-3 font-semibold">Latency</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/10">
                {filteredRecords.map((r) => {
                  const isForged = r.prediction.toLowerCase().includes('forged') || r.prediction.toLowerCase().includes('not match');
                  const isExpanded = expandedId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-purple-900/10 transition-colors">
                        <td className="py-3 text-xs text-purple-300/70 font-mono whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </td>

                        {/* Label / Description column */}
                        <td className="py-3">
                          {r.label ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-900/40 border border-purple-700/40 text-purple-200">
                              <Tag size={12} className="text-purple-400" />
                              <span className="max-w-[160px] truncate" title={r.label}>
                                {r.label}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-purple-400/40 italic">Unlabeled</span>
                          )}
                        </td>

                        {/* Specimen File */}
                        <td className="py-3 font-medium text-purple-100 max-w-[160px] truncate" title={r.image_filename}>
                          {r.image_filename}
                        </td>

                        {/* Verdict */}
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              isForged
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {isForged ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                            {r.prediction}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td className="py-3 font-bold text-white">
                          {r.confidence}%
                        </td>

                        {/* Model */}
                        <td className="py-3 text-xs text-purple-300/70 max-w-[140px] truncate">
                          {r.model_used}
                        </td>

                        {/* Latency */}
                        <td className="py-3 text-xs text-purple-400/80 font-mono">
                          {r.prediction_time_ms} ms
                        </td>

                        {/* Actions */}
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                              className="p-1.5 rounded-lg hover:bg-purple-800/30 text-purple-400"
                              title="Toggle Explanation Details"
                            >
                              <ChevronDown
                                size={15}
                                className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-900/30 text-rose-400"
                              title="Delete record from Firestore"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Explanation Drawer */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-4 bg-purple-950/20 border-b border-purple-900/20">
                            <div className="text-xs space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-purple-300 uppercase tracking-wider text-[11px]">
                                  SHAP Attribution Summary (Firestore Document ID: {r.id})
                                </span>
                                {r.label && (
                                  <span className="text-[11px] text-purple-300/80">
                                    Specimen Label: <strong className="text-white">{r.label}</strong>
                                  </span>
                                )}
                              </div>
                              <p className="text-purple-100 leading-relaxed bg-black/30 p-3 rounded-lg border border-purple-900/30">
                                {r.explanation_summary || 'No explanation recorded for this specimen.'}
                              </p>
                              {r.features && (
                                <div className="flex flex-wrap gap-4 text-[11px] text-purple-300/80 pt-1">
                                  {r.features.stroke_smoothness !== undefined && (
                                    <span>
                                      Smoothness: <strong>{r.features.stroke_smoothness}</strong>/100
                                    </span>
                                  )}
                                  {r.features.stroke_consistency !== undefined && (
                                    <span>
                                      Consistency: <strong>{r.features.stroke_consistency}</strong>/100
                                    </span>
                                  )}
                                  {r.features.dominant_region && (
                                    <span>
                                      Dominant Region: <strong>{r.features.dominant_region}</strong>
                                    </span>
                                  )}
                                  {r.features.solidity && (
                                    <span>
                                      Solidity: <strong>{r.features.solidity}</strong>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
