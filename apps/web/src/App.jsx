import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Clients from './pages/Clients.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Log from './pages/Log.jsx';
import Login from './pages/Login.jsx';
import More from './pages/More.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Privacy from './pages/Privacy.jsx';
import Progress from './pages/Progress.jsx';
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
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/log" element={<Log />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/train" element={<Train />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/more" element={<More />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
