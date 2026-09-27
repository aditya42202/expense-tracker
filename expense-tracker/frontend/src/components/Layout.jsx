import { BarChart3, Bell, CreditCard, Gauge, LayoutDashboard, LogOut, Menu, PiggyBank, Settings, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Expenses', to: '/expenses', icon: CreditCard },
  { label: 'Income', to: '/income', icon: TrendingUp },
  { label: 'Budget', to: '/budget', icon: Gauge },
  { label: 'Savings', to: '/savings', icon: PiggyBank },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Profile', to: '/profile', icon: UserRound },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    const loadNotifications = async () => {
      try {
        const { data } = await api.get('/notifications/');
        if (!active) return;
        setUnreadCount(data.filter((item) => !item.is_read).length);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-800">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-slate-950 text-slate-100 md:flex md:flex-col">
          <div className="border-b border-white/10 px-6 py-7">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-950/40">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-300">Finance OS</div>
                <h1 className="mt-0.5 text-lg font-bold text-white">Pennywise</h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-5">
            {navItems.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {t(label)}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="space-y-3">
              <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('Select language')}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                {t('Logout')}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 p-2 text-slate-700 md:hidden"
                  onClick={() => setMobileOpen((open) => !open)}
                  aria-label={t('Toggle menu')}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">{t('Overview')}</p>
                  <h2 className="text-lg font-semibold text-slate-900 md:text-xl">{t('Welcome back, ')}{user?.name || t('User')}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="relative rounded-full border border-slate-200 bg-slate-50 p-2.5 text-slate-600 transition hover:bg-slate-100"
                  aria-label={t('Notifications')}
                  onClick={() => navigate('/notifications')}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <NavLink to="/profile" aria-label={t('Open full profile')} className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-indigo-200 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:flex">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-900">{user?.name || 'User'}</p>
                    <p className="text-[11px] text-slate-500">{user?.email || 'user@example.com'}</p>
                  </div>
                </NavLink>
              </div>
            </div>
          </header>

          {mobileOpen && (
            <div className="border-b border-slate-200 bg-white md:hidden">
              <nav className="space-y-1 p-3">
                {navItems.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={label}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                        isActive ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {t(label)}
                  </NavLink>
                ))}
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-sm font-medium text-slate-700"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  {t('Logout')}
                </button>
                <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-600">
                  {t('Select language')}
                  <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('Select language')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800">
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                  </select>
                </label>
              </nav>
            </div>
          )}

          <main className="flex-1 p-4 md:p-8 lg:px-10">{children}</main>

          <footer className="border-t border-slate-200 bg-white px-4 py-4 md:px-8">
            <div className="flex flex-col items-center justify-between gap-2 text-sm text-slate-500 sm:flex-row">
              <p>© 2026 Pennywise. {t('All rights reserved.')}</p>
              <div className="flex items-center gap-4">
                <span>{t('Privacy')}</span>
                <span>{t('Terms')}</span>
                <span>{t('Support')}</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
