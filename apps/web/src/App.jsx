import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import BottomNav from './components/BottomNav.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import layoutStyles from './components/AppLayout.module.css';
import { useMe } from './hooks/useAuth.js';
import Clients from './pages/Clients.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Heatmap from './pages/Heatmap.jsx';
import Landing from './pages/Landing.jsx';
import Log from './pages/Log.jsx';
import Login from './pages/Login.jsx';
import More from './pages/More.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Privacy from './pages/Privacy.jsx';
import Progress from './pages/Progress.jsx';
import Register from './pages/Register.jsx';
import Terms from './pages/Terms.jsx';
import Train from './pages/Train.jsx';

// "/" is public: signed-out visitors get the marketing Landing page,
// signed-in users get the Dashboard exactly as before (same layout +
// bottom nav as every other in-app screen). Kept outside ProtectedRoute
// so a logged-out visit to "/" doesn't get redirected to /login.
function RootRoute() {
  const { data: user, isLoading } = useMe();

  if (isLoading) return null;
  if (!user) return <Landing />;

  return (
    <div className={layoutStyles.layout}>
      <Dashboard />
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route path="/log" element={<Log />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/heatmap" element={<Heatmap />} />
            <Route path="/train" element={<Train />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/more" element={<More />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
