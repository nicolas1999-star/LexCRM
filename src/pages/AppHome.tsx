import { useEffect, useState } from 'react';
import { Alert, Box, Snackbar, Typography } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth';

type LocationState = { noPermission?: boolean };

const AppHome = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.noPermission) {
      setShowToast(true);
    }
  }, [location.state]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Home
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Sessão ativa para {user?.name ?? 'Usuário'} ({user?.email}).
      </Typography>
      <Snackbar
        open={showToast}
        autoHideDuration={4000}
        onClose={() => setShowToast(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" variant="filled">
          Sem permissão
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AppHome;
