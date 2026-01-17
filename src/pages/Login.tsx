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
import { useNavigate } from 'react-router-dom';
import {
  authCreateInitialAdmin,
  authGetBootstrapStatus,
  authLogin,
  type AppError
} from '../api/auth';
import { useAuth } from '../state/auth';

const LoginPage = () => {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrap, setIsBootstrap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const status = await authGetBootstrapStatus();
        setIsBootstrap(!status.hasAnyUser);
      } catch (err) {
        const message = (err as AppError)?.message ?? 'Falha ao carregar status.';
        setError(message);
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
      const message = (err as AppError)?.message ?? 'Não foi possível autenticar.';
      setError(message);
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
                {isBootstrap ? 'Criar Admin Inicial' : 'Bem-vindo de volta'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isBootstrap
                  ? 'Defina o primeiro administrador para iniciar o LexCRM.'
                  : 'Entre com suas credenciais para continuar.'}
              </Typography>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            {isBootstrap && (
              <TextField
                label="Nome"
                value={form.name}
                onChange={handleChange('name')}
                fullWidth
              />
            )}
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              fullWidth
            />
            <TextField
              label="Senha"
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
              {isBootstrap ? 'Criar Admin' : 'Entrar'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
