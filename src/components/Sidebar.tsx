import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Home,
  Shield,
  Search,
  BarChart3,
  Brain,
  History,
  User,
  Info,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  X
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onToggle,
}) => {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'home', label: 'Home Dashboard', icon: Home },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin Panel', icon: Shield }] : []),
    { id: 'detection', label: 'Signature Detection', icon: Search },
    { id: 'performance', label: 'Model Performance', icon: BarChart3 },
    { id: 'explainability', label: 'Explainability', icon: Brain },
    { id: 'history', label: 'Prediction History', icon: History },
    { id: 'profile', label: 'User Profile', icon: User },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
          onClick={onToggle}
          title="Click to close sidebar"
        />
      )}

      {/* Sidebar Container: Collapsible on all screen sizes so the rest of the screen is undisturbed */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-50 bg-gradient-to-b from-[#100D1C] to-[#0B0A14] border-r border-purple-900/20 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none overflow-hidden ${
          isOpen
            ? 'w-72 translate-x-0 opacity-100 shadow-2xl md:shadow-none'
            : 'w-0 -translate-x-full md:translate-x-0 md:w-0 opacity-0 pointer-events-none border-none'
        }`}
      >
        <div className="w-72 flex flex-col h-full min-h-screen">
          {/* Header / Brand & Close Toggle */}
          <div className="p-4 border-b border-purple-900/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-md shadow-purple-500/30 text-white font-extrabold text-base tracking-tight shrink-0">
                Fx
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold bg-gradient-to-r from-purple-300 via-purple-200 to-fuchsia-300 bg-clip-text text-transparent truncate">
                  ForgeXplain
                </h1>
                <p className="text-[10px] text-purple-300/70 font-medium truncate">
                  Detect &bull; Explain &bull; Trust
                </p>
              </div>
            </div>

            {/* Close Sidebar Button (available on desktop and mobile) */}
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg text-purple-400 hover:text-white hover:bg-purple-900/40 border border-purple-800/30 transition-colors shrink-0 cursor-pointer"
              title="Close sidebar (undisturbed mode)"
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          {/* User Card */}
          {user && (
            <div className="mx-3 mt-3 p-3 rounded-xl bg-purple-950/30 border border-purple-800/20">
              <div className="text-[10px] text-purple-300/60 font-semibold uppercase tracking-wider">Signed in as</div>
              <div className="text-xs font-bold text-purple-100 truncate mt-0.5">{user.full_name}</div>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-purple-300/60 truncate max-w-[130px]">{user.email}</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-semibold text-[9px] uppercase tracking-wider ${
                    user.role === 'admin'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {user.role}
                </span>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    if (window.innerWidth < 768) onToggle();
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600/30 to-purple-800/20 text-white border border-purple-500/40 shadow-sm shadow-purple-500/10'
                      : 'text-purple-200/70 hover:text-white hover:bg-purple-900/20'
                  }`}
                >
                  <Icon
                    size={17}
                    className={isActive ? 'text-purple-400' : 'text-purple-400/60'}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer & Logout */}
          <div className="p-3 border-t border-purple-900/20 space-y-2.5">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/30 transition-colors cursor-pointer"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
            <div className="flex items-center justify-between text-[10px] text-purple-400/50 px-1">
              <span>ForgeXplain v1.0.0</span>
              <span className="font-mono">Ctrl+B</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
