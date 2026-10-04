import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, PredictionRecord, SignerRecord } from '../types';
import { subscribeSigners, saveSignerToFirestore, deleteSignerFromFirestore, subscribePredictions } from '../services/firestoreService';
import { loadImage, runPreprocessingPipeline, extract23Features } from '../utils/signatureAnalysis';
import { BulkSignerEnrollment } from '../components/BulkSignerEnrollment';
import { Shield, Users, RefreshCw, PenTool, Trash2, CheckCircle2, AlertCircle, Upload, Check } from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'predictions' | 'retrain' | 'signers'>('users');

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserToDelete, setSelectedUserToDelete] = useState<string>('');
  const [userError, setUserError] = useState<string | null>(null);

  // Predictions state
  const [allPredictions, setAllPredictions] = useState<PredictionRecord[]>([]);

  // Retrain state
  const [datasetSource, setDatasetSource] = useState<'auto' | 'cedar' | 'synthetic'>('auto');
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState<any>(null);

  // Signers state
  const [signers, setSigners] = useState<SignerRecord[]>([]);

  useEffect(() => {
    fetchUsers();

    // Live subscription to all predictions in Firestore
    const unsubPreds = subscribePredictions(undefined, true, (list) => {
      setAllPredictions(list);
    });

    // Live subscription to all signers in Firestore
    const unsubSigners = subscribeSigners((list) => {
      setSigners(list);
    });

    return () => {
      unsubPreds();
      unsubSigners();
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data);
      if (data.length > 0) setSelectedUserToDelete(data[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async () => {
    setUserError(null);
    if (!selectedUserToDelete) return;
    if (selectedUserToDelete === user?.id) {
      setUserError('You cannot delete your own account while logged in.');
      return;
    }

    try {
      const res = await fetch(`/api/users/${selectedUserToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== selectedUserToDelete));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRetrain = async () => {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await fetch('/api/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_source: datasetSource }),
      });
      const data = await res.json();
      setRetrainResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRetraining(false);
    }
  };

  const handleDeleteSigner = async (id: string) => {
    try {
      await deleteSignerFromFirestore(id);
    } catch {
      try {
        await fetch(`/api/signers/${id}`, { method: 'DELETE' });
      } catch {}
    }
    setSigners((prev) => prev.filter((s) => s.id !== id));
  };

  if (user?.role !== 'admin') {
    return (
      <div className="fx-card p-12 text-center text-rose-400">
        You do not have permission to view the Admin Panel.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-3 border-b border-purple-900/20">
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
          <span>🛠️</span> Admin Governance Panel
        </h2>
        <p className="text-sm text-purple-300/70 mt-1">
          Manage system users, review cross-organization audit trails, enroll reference signers in Firestore, and trigger model retraining.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-purple-900/20 pb-2">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'users'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'text-purple-300/60 hover:text-white hover:bg-purple-900/20'
          }`}
        >
          <Users size={15} />
          <span>👥 Manage Users ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('predictions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'predictions'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'text-purple-300/60 hover:text-white hover:bg-purple-900/20'
          }`}
        >
          <Shield size={15} />
          <span>📈 All Predictions ({allPredictions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('retrain')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'retrain'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'text-purple-300/60 hover:text-white hover:bg-purple-900/20'
          }`}
        >
          <RefreshCw size={15} />
          <span>🔁 Retrain Models</span>
        </button>

        <button
          onClick={() => setActiveTab('signers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'signers'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'text-purple-300/60 hover:text-white hover:bg-purple-900/20'
          }`}
        >
          <PenTool size={15} />
          <span>🖊️ Registered Signers ({signers.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USERS */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="fx-card p-6">
            <h3 className="text-base font-bold text-white mb-4">Registered Accounts</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-purple-900/30 text-purple-300/60 text-xs">
                    <th className="pb-3 font-semibold">User ID</th>
                    <th className="pb-3 font-semibold">Full Name</th>
                    <th className="pb-3 font-semibold">Email</th>
                    <th className="pb-3 font-semibold">Role</th>
                    <th className="pb-3 font-semibold text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/10">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-purple-900/10 transition-colors">
                      <td className="py-3 text-xs font-mono text-purple-400">{u.id}</td>
                      <td className="py-3 font-semibold text-white">{u.full_name}</td>
                      <td className="py-3 text-purple-200">{u.email}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                            u.role === 'admin'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-purple-300/60 text-right">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Delete User Action */}
            <div className="mt-8 pt-6 border-t border-purple-900/20 max-w-md">
              <h4 className="text-sm font-bold text-rose-300 mb-2">Delete Account</h4>
              {userError && (
                <div className="p-3 mb-3 rounded-lg bg-rose-950/40 border border-rose-600/30 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{userError}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <select
                  value={selectedUserToDelete}
                  onChange={(e) => setSelectedUserToDelete(e.target.value)}
                  className="bg-[#1C1830] border border-purple-700/40 rounded-xl px-3 py-2 text-xs text-purple-200 focus:outline-hidden flex-1"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDeleteUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Delete User</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ALL PREDICTIONS */}
      {/* ========================================================================= */}
      {activeTab === 'predictions' && (
        <div className="fx-card p-6">
          <h3 className="text-base font-bold text-white mb-4">System-Wide Audit Log (Firestore)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-purple-900/30 text-purple-300/60 text-xs">
                  <th className="pb-3 font-semibold">Timestamp</th>
                  <th className="pb-3 font-semibold">User ID</th>
                  <th className="pb-3 font-semibold">Specimen</th>
                  <th className="pb-3 font-semibold">Verdict</th>
                  <th className="pb-3 font-semibold">Confidence</th>
                  <th className="pb-3 font-semibold">Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/10">
                {allPredictions.map((p) => {
                  const isForged = p.prediction.toLowerCase().includes('forged') || p.prediction.toLowerCase().includes('not match');
                  return (
                    <tr key={p.id} className="hover:bg-purple-900/10 transition-colors">
                      <td className="py-3 text-xs text-purple-300/70 font-mono">
                        {new Date(p.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 text-xs text-purple-400 font-mono truncate max-w-[120px]">{p.user_id}</td>
                      <td className="py-3 font-semibold text-white">{p.image_filename}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            isForged ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {p.prediction}
                        </span>
                      </td>
                      <td className="py-3 font-bold text-white">{p.confidence}%</td>
                      <td className="py-3 text-xs text-purple-300/70">{p.model_used}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RETRAIN MODELS */}
      {/* ========================================================================= */}
      {activeTab === 'retrain' && (
        <div className="fx-card p-6 space-y-6 max-w-xl">
          <div>
            <h3 className="text-base font-bold text-white">Retrain Offline Models</h3>
            <p className="text-xs text-purple-300/70 mt-1 leading-relaxed">
              Triggers the retraining pipeline on the configured dataset source (CEDAR per-writer dataset if mounted, or synthetic fallback).
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-purple-200">Dataset Source:</label>
            <select
              value={datasetSource}
              onChange={(e) => setDatasetSource(e.target.value as any)}
              className="w-full bg-[#1C1830] border border-purple-700/40 rounded-xl px-3 py-2 text-xs text-purple-200 focus:outline-hidden"
            >
              <option value="auto">Auto-Detect (CEDAR if present, else Synthetic)</option>
              <option value="cedar">CEDAR Signature Dataset (full_org & full_forg)</option>
              <option value="synthetic">Synthetic Signature Identity Generator</option>
            </select>
          </div>

          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw size={15} className={retraining ? 'animate-spin' : ''} />
            <span>{retraining ? 'Retraining Models (Feature Scaler & Ensemble)...' : 'Start Retraining Pipeline'}</span>
          </button>

          {retrainResult && (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 space-y-2">
              <div className="font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>{retrainResult.message}</span>
              </div>
              <div className="pt-2 border-t border-emerald-800/40 space-y-1">
                <div>
                  <strong>Random Forest:</strong> Accuracy: {(retrainResult.metrics.random_forest.accuracy * 100).toFixed(2)}%, F1: {(retrainResult.metrics.random_forest.f1_score * 100).toFixed(2)}%
                </div>
                <div>
                  <strong>SVM:</strong> Accuracy: {(retrainResult.metrics.svm.accuracy * 100).toFixed(2)}%, F1: {(retrainResult.metrics.svm.f1_score * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: REGISTERED SIGNERS */}
      {/* ========================================================================= */}
      {activeTab === 'signers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bulk Signer Enrollment Component */}
            <div className="lg:col-span-3">
              <BulkSignerEnrollment
                onSignerEnrolled={(newRecord) => {
                  setSigners((prev) => [...prev.filter((s) => s.id !== newRecord.id), newRecord]);
                }}
              />
            </div>

            {/* Registered Signers List */}
            <div className="fx-card p-6 lg:col-span-2">
              <h3 className="text-base font-bold text-white mb-4">Active Enrolled Signers (Firestore)</h3>
              <div className="space-y-3">
                {signers.length > 0 ? (
                  signers.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/30 flex items-center justify-between"
                    >
                      <div>
                        <h4 className="text-sm font-bold text-white">{s.name}</h4>
                        <div className="flex items-center gap-3 text-xs text-purple-300/70 mt-1">
                          <span>{s.num_samples} reference specimen{s.num_samples > 1 ? 's' : ''}</span>
                          <span>&bull;</span>
                          <span>Enrolled: {new Date(s.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteSigner(s.id)}
                        className="p-2 rounded-lg text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Delete signer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-purple-300/50 py-6 text-center">
                    No signers enrolled yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
