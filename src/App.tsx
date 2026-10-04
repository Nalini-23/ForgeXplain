import React, { useState } from 'react';
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
import { Menu } from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null);

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
    <div className="flex min-h-screen bg-[#0B0A14] text-[#EDEBF7]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Top Bar */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-purple-900/20 bg-[#100D1C]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center text-white font-extrabold text-sm">
              Fx
            </div>
            <span className="font-extrabold text-sm text-purple-200">ForgeXplain</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-lg bg-purple-900/30 text-purple-300 hover:text-white"
          >
            <Menu size={20} />
          </button>
        </header>

        {/* Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
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
