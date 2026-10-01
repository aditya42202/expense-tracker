import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import UnifiedExpensesPage from './pages/finance/UnifiedExpensesPage';
import IncomePage from './pages/finance/IncomePage';
import BudgetPage from './pages/finance/BudgetPage';
import SavingsPage from './pages/finance/SavingsPage';
import ReportsPage from './pages/finance/ReportsPage';
import ProfilePage from './pages/finance/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium shadow-sm">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }} replace />;
  }

  return <Layout>{children}</Layout>;
}

function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700" role="status">
        <p className="text-sm font-medium">Loading Pennywise...</p>
      </div>
    );
  }

  return user ? <Navigate to="/dashboard" replace /> : <HomePage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/daily-expenses" element={<Navigate to="/expenses?view=daily" replace />} />
      <Route path="/expenses" element={<ProtectedRoute><UnifiedExpensesPage /></ProtectedRoute>} />
      <Route path="/group-expenses" element={<Navigate to="/expenses?view=group" replace />} />
      <Route path="/income" element={<ProtectedRoute><IncomePage /></ProtectedRoute>} />
      <Route path="/budget" element={<ProtectedRoute><BudgetPage /></ProtectedRoute>} />
      <Route path="/savings" element={<ProtectedRoute><SavingsPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
