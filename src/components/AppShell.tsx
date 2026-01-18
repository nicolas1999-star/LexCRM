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
      logoutError = getErrorMessage(err, 'Falha ao sair.');
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
            LexCRM
          </Typography>
          <Button color="secondary" variant="outlined" onClick={handleLogout}>
            Sair
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
          <Typography variant="h6">Navegação</Typography>
        </Toolbar>
        <List>
          <ListItemButton component={NavLink} to="/app/home">
            <ListItemText primary="Home" />
          </ListItemButton>
          <ListItemButton component={NavLink} to="/app/atendimentos">
            <ListItemText primary="Atendimentos" />
          </ListItemButton>
          {canAccessAdmin && (
            <>
              <ListItemButton component={NavLink} to="/admin/users">
                <ListItemText primary="Usuários" />
              </ListItemButton>
              <ListItemButton component={NavLink} to="/admin/clients">
                <ListItemText primary="Clientes" />
              </ListItemButton>
              <ListItemButton component={NavLink} to="/admin/teams">
                <ListItemText primary="Equipes" />
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
