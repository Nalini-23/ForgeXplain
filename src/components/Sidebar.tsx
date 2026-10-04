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
  X,
  Menu
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
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-[#100D1C] to-[#0B0A14] border-r border-purple-900/20 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header / Brand */}
        <div className="p-6 text-center border-b border-purple-900/20 relative">
          <button
            onClick={onToggle}
            className="md:hidden absolute right-4 top-4 text-purple-300 hover:text-white"
          >
            <X size={20} />
          </button>

          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30 text-white font-extrabold text-2xl tracking-tight">
            Fx
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-300 via-purple-200 to-fuchsia-300 bg-clip-text text-transparent">
            ForgeXplain
          </h1>
          <p className="text-xs text-purple-300/80 font-medium mt-0.5">
            Detect. Explain. Trust.
          </p>
        </div>

        {/* User Card */}
        {user && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-purple-950/30 border border-purple-800/20">
            <div className="text-xs text-purple-300/60 font-medium">Signed in as</div>
            <div className="text-sm font-semibold text-purple-100 truncate">{user.full_name}</div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-purple-300/60 truncate max-w-[140px]">{user.email}</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wider ${
                user.role === 'admin'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
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
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600/30 to-purple-800/10 text-white border border-purple-500/30 shadow-sm shadow-purple-500/10'
                    : 'text-purple-200/70 hover:text-white hover:bg-purple-900/20'
                }`}
              >
                <Icon
                  size={18}
                  className={isActive ? 'text-purple-400' : 'text-purple-400/60'}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer & Logout */}
        <div className="p-4 border-t border-purple-900/20 space-y-3">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-rose-300 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/30 transition-colors"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
          <div className="text-center text-[11px] text-purple-400/40">
            ForgeXplain v1.0.0
          </div>
        </div>
      </aside>
    </>
  );
};
