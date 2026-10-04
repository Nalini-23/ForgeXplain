import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, KeyRound, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, signup, signInWithGoogle } = useAuth();
  const [view, setView] = useState<'login' | 'signup' | 'forgot'>('login');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const res = await signInWithGoogle();
      if (!res.success) {
        setError(res.error || 'Google sign-in failed');
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (view === 'login') {
        const res = await login(email, password);
        if (!res.success) setError(res.error || 'Invalid credentials');
      } else if (view === 'signup') {
        if (!fullName.trim()) {
          setError('Full name is required');
          setLoading(false);
          return;
        }
        const res = await signup(email, password, fullName);
        if (!res.success) setError(res.error || 'Registration failed');
      } else {
        setSuccessMsg(`If an account exists for ${email}, a password reset token has been sent.`);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-purple-500/30 text-white font-black text-3xl">
            Fx
          </div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent">
            ForgeXplain
          </h1>
          <p className="text-xs text-purple-300/80 font-medium">
            Explainable AI-Powered Offline Signature Forgery Detection
          </p>
        </div>

        {/* Auth Card */}
        <div className="fx-card p-8 border border-purple-800/30 shadow-2xl">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold text-white">
              {view === 'login' && 'Sign in to your account'}
              {view === 'signup' && 'Create your account'}
              {view === 'forgot' && 'Reset your password'}
            </h2>
            <p className="text-xs text-purple-300/60 mt-0.5">
              {view === 'login' && 'Use Google Sign-in with Firebase Auth to securely identify users'}
              {view === 'signup' && 'Register your examiner profile in Firestore'}
              {view === 'forgot' && 'Enter your email to receive recovery instructions'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-600/40 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Primary Action: Google Sign-in with Firebase Auth */}
          {view !== 'forgot' && (
            <div className="space-y-4 mb-5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-white text-gray-900 hover:bg-gray-100 shadow-md flex items-center justify-center gap-3 transition-all hover:scale-101 disabled:opacity-50"
              >
                {googleLoading ? (
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Sign in with Google (Firebase)</span>
              </button>

              <div className="flex items-center gap-3 text-xs text-purple-400/50">
                <div className="h-px flex-1 bg-purple-900/30" />
                <span>or continue with email</span>
                <div className="h-px flex-1 bg-purple-900/30" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {view === 'signup' && (
              <div>
                <label className="text-xs font-semibold text-purple-200">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full bg-[#1C1830] border border-purple-700/40 rounded-xl px-3.5 py-2 text-xs text-white placeholder-purple-400/40 focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-purple-200">Email Address</label>
              <input
                type="email"
                required
                placeholder="examiner@forgexplain.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-[#1C1830] border border-purple-700/40 rounded-xl px-3.5 py-2 text-xs text-white placeholder-purple-400/40 focus:outline-hidden focus:border-purple-500"
              />
            </div>

            {view !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-purple-200">Password</label>
                  {view === 'login' && (
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-[11px] text-purple-400 hover:text-purple-300"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full bg-[#1C1830] border border-purple-700/40 rounded-xl px-3.5 py-2 text-xs text-white placeholder-purple-400/40 focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {view === 'login' && <LogIn size={15} />}
                  {view === 'signup' && <UserPlus size={15} />}
                  {view === 'forgot' && <KeyRound size={15} />}
                  <span>
                    {view === 'login' && 'Sign In with Credentials'}
                    {view === 'signup' && 'Create Account'}
                    {view === 'forgot' && 'Send Reset Link'}
                  </span>
                </>
              )}
            </button>
          </form>

          {/* View Switchers */}
          <div className="mt-6 pt-4 border-t border-purple-900/20 text-center text-xs">
            {view === 'login' ? (
              <p className="text-purple-300/70">
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setView('signup');
                    setError(null);
                  }}
                  className="font-bold text-purple-400 hover:underline"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <button
                onClick={() => {
                  setView('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="font-bold text-purple-400 hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft size={13} />
                <span>Back to sign in</span>
              </button>
            )}
          </div>
        </div>

        {/* Demo Credentials hint */}
        <div className="text-center text-[11px] text-purple-400/50">
          Default Admin: <span className="font-mono text-purple-300">naliniraju774@gmail.com</span> / <span className="font-mono text-purple-300">admin@forgexplain.ai</span>
        </div>
      </div>
    </div>
  );
};
