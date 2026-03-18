import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Watchlist from './pages/Watchlist';
import Signal from './pages/Signal';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Runs from './pages/Runs';
import Leaderboard from './pages/Leaderboard';
import Graph from './pages/Graph';
import AppShell from './components/AppShell';
import './index.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

// Layout wrapper that provides AppShell to all protected routes
const AppLayout = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />

            {/* All protected routes share ONE persistent AppShell */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/signal/:id" element={<Signal />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/runs" element={<Runs />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/graph" element={<Graph />} />
              <Route path="/logs" element={<Logs />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppDataProvider>
    </AuthProvider>
  );
}

export default App;
