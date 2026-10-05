import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { HomeDashboard } from './pages/HomeDashboard';
import { SignatureDetection } from './pages/SignatureDetection';
import { Explainability } from './pages/Explainability';
import { ModelPerformance } from './pages/ModelPerformance';
import { PredictionHistory } from './pages/PredictionHistory';
import { AdminPanel } from './pages/AdminPanel';
import { UserProfile } from './pages/UserProfile';
import { AboutPage } from './pages/AboutPage';
import { AuthView } from './pages/AuthView';
import { AnalysisResult } from './types';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  Shield,
  Search,
  BarChart3,
  Brain,
  History,
  User,
  Info,
} from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('home');

  // Load sidebar open preference from localStorage (default: open on desktop >= 1024px, closed on mobile)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('forgexplain_sidebar_open');
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });

  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null);

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('forgexplain_sidebar_open', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar anywhere
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
      if (e.key === 'Escape' && isSidebarOpen && window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  const tabTitles: Record<string, string> = {
    home: 'Home Dashboard',
    admin: 'Admin Management',
    detection: 'Signature Detection & Verification',
    performance: 'Model Performance & Retraining',
    explainability: 'Visual Explainability Studio',
    history: 'Prediction History & Audit Trail',
    profile: 'User Profile & API Keys',
    about: 'About ForgeXplain',
  };

  const tabIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    home: Home,
    admin: Shield,
    detection: Search,
    performance: BarChart3,
    explainability: Brain,
    history: History,
    profile: User,
    about: Info,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0A14] text-purple-300">
        <div className="w-8 h-8 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <div className="flex min-h-screen bg-[#0B0A14] text-[#EDEBF7] overflow-x-hidden">
      {/* Collapsible Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={isSidebarOpen}
        onToggle={handleToggleSidebar}
      />

      {/* Main Content Area - Smoothly expands when sidebar is closed so the rest of the screen is undisturbed */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto transition-all duration-300 ease-in-out">
        {/* Global Responsive Top Bar with Sidebar Controls */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-purple-900/20 bg-[#100D1C]/90 backdrop-blur-md sticky top-0 z-30 transition-all">
          <div className="flex items-center gap-3">
            {/* Sidebar Toggle Button */}
            <button
              onClick={handleToggleSidebar}
              className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer ${
                isSidebarOpen
                  ? 'bg-purple-950/50 border-purple-800/40 text-purple-300 hover:text-white hover:bg-purple-900/40'
                  : 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 hover:bg-purple-500'
              }`}
              title={
                isSidebarOpen
                  ? 'Close sidebar to view undisturbed full-width screen (Ctrl+B)'
                  : 'Open navigation sidebar (Ctrl+B)'
              }
              aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              <span className="hidden sm:inline">
                {isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
              </span>
            </button>

            {/* Current Active Page Title & Icon */}
            <div className="flex items-center gap-2">
              <span className="text-purple-600/60 hidden sm:inline">&bull;</span>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
                {tabIcons[currentTab] &&
                  React.createElement(tabIcons[currentTab], {
                    size: 15,
                    className: 'text-purple-400 shrink-0',
                  })}
                <span className="truncate">{tabTitles[currentTab] || currentTab}</span>
              </div>
            </div>
          </div>

          {/* Right Header Status / Undisturbed Screen Mode Indicator */}
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-purple-950/70 text-purple-300 border border-purple-700/40 hidden md:inline-flex items-center gap-1.5 shadow-xs cursor-pointer hover:bg-purple-900/60 transition-colors"
                title="Sidebar is currently closed so the screen is undisturbed. Click to reopen."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Undisturbed Screen Mode</span>
              </button>
            )}

            {user && (
              <div
                onClick={() => setCurrentTab('profile')}
                className="flex items-center gap-2 cursor-pointer p-1 rounded-xl hover:bg-purple-900/20 transition-colors"
                title="View user profile"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {user.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
                </div>
                <span className="text-xs font-semibold text-purple-200 hidden lg:inline max-w-[120px] truncate">
                  {user.full_name || user.email}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Content Container - Expands smoothly to wider maximum width when sidebar is closed */}
        <main
          className={`flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'max-w-7xl' : 'max-w-[1600px]'
          }`}
        >
          {currentTab === 'home' && (
            <HomeDashboard onNavigate={(tab) => setCurrentTab(tab)} />
          )}

          {currentTab === 'detection' && (
            <SignatureDetection
              onAnalyzeComplete={(res) => setLastResult(res)}
            />
          )}

          {currentTab === 'explainability' && (
            <Explainability
              lastResult={lastResult}
              onNavigateToDetect={() => setCurrentTab('detection')}
            />
          )}

          {currentTab === 'performance' && <ModelPerformance />}

          {currentTab === 'history' && <PredictionHistory />}

          {currentTab === 'admin' && <AdminPanel />}

          {currentTab === 'profile' && <UserProfile />}

          {currentTab === 'about' && <AboutPage />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
