import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { authCreateInitialAdmin, authGetBootstrapStatus, authLogin } from '../api/auth';
import { getErrorMessage } from '../api/errors';
import { t } from '../i18n';
import { useAuth } from '../state/auth';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrap, setIsBootstrap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    const state = location.state as { logoutError?: string } | null;
    if (state?.logoutError) {
      setError(state.logoutError);
    }
  }, [location.state]);

  useEffect(() => {
    const load = async () => {
      try {
        const status = await authGetBootstrapStatus();
        setIsBootstrap(!status.hasAnyUser);
      } catch (err) {
        setError(getErrorMessage(err, t('login.error.loadStatus')));
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (field: 'name' | 'email' | 'password') =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async () => {
    setError(null);
    try {
      if (isBootstrap) {
        const response = await authCreateInitialAdmin({
          name: form.name,
          email: form.email,
          password: form.password
        });
        setSession(response.user, response.session);
        navigate('/app');
      } else {
        const response = await authLogin({
          email: form.email,
          password: form.password
        });
        setSession(response.user, response.session);
        navigate('/app');
      }
    } catch (err) {
      setError(getErrorMessage(err, t('login.error.auth')));
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress color="secondary" />
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding={2}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h4" fontWeight={700}>
                {isBootstrap ? t('login.title.bootstrap') : t('login.title.default')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isBootstrap
                  ? t('login.subtitle.bootstrap')
                  : t('login.subtitle.default')}
              </Typography>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            {isBootstrap && (
              <TextField
                label={t('login.label.name')}
                value={form.name}
                onChange={handleChange('name')}
                fullWidth
              />
            )}
            <TextField
              label={t('login.label.email')}
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              fullWidth
            />
            <TextField
              label={t('login.label.password')}
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              fullWidth
            />
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleSubmit}
            >
              {isBootstrap ? t('login.button.createAdmin') : t('login.button.signIn')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
