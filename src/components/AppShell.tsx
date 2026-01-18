import { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  Alert
} from '@mui/material';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authLogout } from '../api/auth';
import { getErrorMessage } from '../api/errors';
import { t } from '../i18n';
import { Role, useAuth } from '../state/auth';

const drawerWidth = 240;

const ADMIN_ROLES = new Set<Role>([Role.ADMIN, Role.PARTNER]);

const AppShell = () => {
  const navigate = useNavigate();
  const { user, sessionId, clearSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    let logoutError: string | null = null;
    try {
      if (sessionId) {
        await authLogout(sessionId);
      }
    } catch (err) {
      logoutError = getErrorMessage(err, t('errors.logout'));
      setError(logoutError);
    } finally {
      clearSession();
      navigate('/login', {
        replace: true,
        state: logoutError ? { logoutError } : undefined
      });
    }
  };

  const canAccessAdmin = ADMIN_ROLES.has(user?.role ?? '');

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="transparent" elevation={0}>
        <Toolbar sx={{ ml: `${drawerWidth}px` }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('app.brand')}
          </Typography>
          <Button color="secondary" variant="outlined" onClick={handleLogout}>
            {t('app.logout')}
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box'
          }
        }}
      >
        <Toolbar>
          <Typography variant="h6">{t('app.navigation')}</Typography>
        </Toolbar>
        <List>
          <ListItemButton component={NavLink} to="/app/home">
            <ListItemText primary={t('app.home')} />
          </ListItemButton>
          <ListItemButton component={NavLink} to="/app/atendimentos">
            <ListItemText primary={t('app.attendances')} />
          </ListItemButton>
          {canAccessAdmin && (
            <>
              <ListItemButton component={NavLink} to="/admin/users">
                <ListItemText primary={t('app.users')} />
              </ListItemButton>
              <ListItemButton component={NavLink} to="/admin/clients">
                <ListItemText primary={t('app.clients')} />
              </ListItemButton>
              <ListItemButton component={NavLink} to="/admin/teams">
                <ListItemText primary={t('app.teams')} />
              </ListItemButton>
            </>
          )}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, ml: `${drawerWidth}px` }}>
        <Toolbar />
        {error && (
          <Box mb={2}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppShell;
