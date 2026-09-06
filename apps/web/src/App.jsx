import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AdminRoute from './components/AdminRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminCoaches from './pages/AdminCoaches.jsx';
import Clients from './pages/Clients.jsx';
import CoachApplication from './pages/CoachApplication.jsx';
import CoachApplicationStatus from './pages/CoachApplicationStatus.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Log from './pages/Log.jsx';
import Login from './pages/Login.jsx';
import More from './pages/More.jsx';
import NotFound from './pages/NotFound.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Privacy from './pages/Privacy.jsx';
import Progress from './pages/Progress.jsx';
import Refunds from './pages/Refunds.jsx';
import Register from './pages/Register.jsx';
import Terms from './pages/Terms.jsx';
import Train from './pages/Train.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/log" element={<Log />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/train" element={<Train />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/more" element={<More />} />
            <Route path="/coach-application" element={<CoachApplication />} />
            <Route path="/coach-application/status" element={<CoachApplicationStatus />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin/coaches" element={<AdminCoaches />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
