import { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Toolbar,
  Typography,
  Alert
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { authLogout, type AppError } from '../api/auth';
import { useAuth } from '../state/auth';

const AppHome = () => {
  const navigate = useNavigate();
  const { user, sessionId, clearSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (!sessionId) {
      clearSession();
      navigate('/login');
      return;
    }

    try {
      await authLogout(sessionId);
      clearSession();
      navigate('/login');
    } catch (err) {
      const message = (err as AppError)?.message ?? 'Falha ao sair.';
      setError(message);
    }
  };

  return (
    <Box minHeight="100vh" display="flex" flexDirection="column">
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            LexCRM
          </Typography>
          <Button color="secondary" variant="outlined" onClick={handleLogout}>
            Sair
          </Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ flexGrow: 1, py: 6 }}>
        {error && (
          <Box mb={2}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
        <Typography variant="h4" gutterBottom>
          Painel principal
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Sessão ativa para {user?.name ?? 'Usuário'} ({user?.email}).
        </Typography>
      </Container>
    </Box>
  );
};

export default AppHome;
