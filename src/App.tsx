import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, Role, useAuth } from './state/auth';
import LoginPage from './pages/Login';
import AppHome from './pages/AppHome';
import AppShell from './components/AppShell';
import AdminPage from './pages/Admin';

const ADMIN_ROLES = new Set<Role>([Role.ADMIN, Role.PARTNER]);

const RequireAdmin = ({ children }: { children: JSX.Element }) => {
  const { user } = useAuth();
  const allowed = ADMIN_ROLES.has(user?.role ?? '');
  if (!allowed) {
    return <Navigate to="/app/home" replace state={{ noPermission: true }} />;
  }
  return children;
};

const AppRoutes = () => {
  const { session } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={session ? <AppShell /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to="/app/home" replace />} />
        <Route path="home" element={<AppHome />} />
      </Route>
      <Route
        path="/admin"
        element={
          session ? (
            <AppShell />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route
          index
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
      </Route>
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
