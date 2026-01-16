import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './state/auth';
import LoginPage from './pages/Login';
import AppHome from './pages/AppHome';

const AppRoutes = () => {
  const { session } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={session ? <AppHome /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
};

export default App;
