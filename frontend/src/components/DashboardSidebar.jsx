import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, DollarSign, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: DollarSign, label: 'Pricing', path: '/pricing' },
];

export default function DashboardSidebar({ user, onLogout }) {
  const location = useLocation();

  return (
    <aside className="w-[200px] shrink-0 border-r border-zinc-800 bg-[#050505] flex flex-col h-screen sticky top-0" data-testid="dashboard-sidebar">
      {/* Logo */}
      <div className="border-b border-zinc-800 px-5 py-4">
        <span className="font-mono font-bold text-base text-white tracking-wider" data-testid="sidebar-logo">AFI</span>
        <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mt-0.5">Filing Intelligence</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" data-testid="sidebar-nav">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-75 ${
                isActive
                  ? 'bg-zinc-900 text-white border-l-2 border-[#0066FF]'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-900'
              }`}
              data-testid={`sidebar-nav-${item.label.toLowerCase()}`}
            >
              <Icon size={14} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User area */}
      <div className="border-t border-zinc-800 px-4 py-4" data-testid="sidebar-user-area">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">Account</div>
        <div className="text-xs text-zinc-400 truncate mb-3 font-mono" data-testid="sidebar-user-email">
          {user?.email}
        </div>
        <div className="inline-flex items-center border border-zinc-800 px-2 py-0.5 mb-3">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{user?.tier || 'RETAIL'}</span>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-xs text-zinc-600 hover:text-white transition-colors duration-75 w-full"
          data-testid="sidebar-logout"
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
