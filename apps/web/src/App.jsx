import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Log from './pages/Log.jsx';
import Login from './pages/Login.jsx';
import More from './pages/More.jsx';
import Progress from './pages/Progress.jsx';
import Register from './pages/Register.jsx';
import Train from './pages/Train.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/log" element={<Log />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/train" element={<Train />} />
            <Route path="/more" element={<More />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
