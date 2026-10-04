import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PredictionRecord } from '../types';
import { User, KeyRound, Check, Activity, ShieldCheck } from 'lucide-react';

export const UserProfile: React.FC = () => {
  const { user, updatePassword } = useAuth();
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/predictions?userId=${user.id}`)
        .then((res) => res.json())
        .then(setPredictions)
        .catch(console.error);
    }
  }, [user]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setPasswordStatus('Password must be at least 8 characters long.');
      return;
    }
    const res = await updatePassword(newPassword);
    if (res.success) {
      setPasswordStatus('Password updated successfully!');
      setNewPassword('');
    } else {
      setPasswordStatus(res.error || 'Failed to update password');
    }
  };

  const total = predictions.length;
  const genuineCount = predictions.filter((p) => p.prediction === 'Genuine').length;
  const genuineRate = total ? ((genuineCount / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="pb-3 border-b border-purple-900/20">
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
          <span>👤</span> User Account & Profile
        </h2>
        <p className="text-sm text-purple-300/70 mt-1">
          Your credentials, system role, and historical biometric verification footprint.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Info */}
        <div className="fx-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-900/30 border border-purple-700/40 flex items-center justify-center text-purple-300">
              <User size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{user?.full_name}</h3>
              <span className="text-xs text-purple-300/70">{user?.email}</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-3 border-t border-purple-900/20 text-xs">
            <div className="flex justify-between py-1 border-b border-purple-950">
              <span className="text-purple-300/60 font-semibold">User Role</span>
              <span className="font-bold uppercase text-purple-300">{user?.role}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-purple-950">
              <span className="text-purple-300/60 font-semibold">Account ID</span>
              <span className="font-mono text-purple-400">{user?.id}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-purple-300/60 font-semibold">Member Since</span>
              <span className="text-purple-200">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Activity Summary */}
        <div className="fx-card p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Activity size={18} className="text-purple-400" />
            Verification Activity
          </h3>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 text-center">
              <span className="text-xs text-purple-300/60 uppercase font-semibold">Total Audits</span>
              <div className="text-3xl font-black text-white mt-1">{total}</div>
            </div>
            <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/30 text-center">
              <span className="text-xs text-purple-300/60 uppercase font-semibold">Genuine Ratio</span>
              <div className="text-3xl font-black text-emerald-400 mt-1">{genuineRate}%</div>
            </div>
          </div>

          <div className="text-xs text-purple-300/60 leading-relaxed pt-2">
            All verification records and associated SHAP attributions are cryptographically hashed and stored in your historical session archive.
          </div>
        </div>
      </div>

      {/* Change Password Form */}
      <div className="fx-card p-6 max-w-lg space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <KeyRound size={18} className="text-purple-400" />
          Update Security Password
        </h3>

        {passwordStatus && (
          <div className="p-3 rounded-lg bg-purple-950/50 border border-purple-500/30 text-xs text-purple-200">
            {passwordStatus}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-purple-300/80">New Password:</label>
            <input
              type="password"
              required
              placeholder="Minimum 8 characters..."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full bg-[#1C1830] border border-purple-700/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all flex items-center gap-2"
          >
            <ShieldCheck size={16} />
            <span>Update Password</span>
          </button>
        </form>
      </div>
    </div>
  );
};
