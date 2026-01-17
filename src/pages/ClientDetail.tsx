import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { clientsGet, type ClientDetail } from '../api/clients';
import { getErrorMessage } from '../api/errors';
import { useAuth } from '../state/auth';

const ClientDetailPage = () => {
  const { sessionId } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canFetch = useMemo(() => !!sessionId && !!id, [sessionId, id]);

  useEffect(() => {
    const loadClient = async () => {
      if (!sessionId || !id) return;
      setError(null);
      try {
        const data = await clientsGet(sessionId, id);
        setClient(data);
      } catch (err) {
        setError(getErrorMessage(err, 'Falha ao carregar cliente.'));
      }
    };
    if (canFetch) {
      void loadClient();
    }
  }, [canFetch, id, sessionId]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Detalhes do cliente
      </Typography>
      {error && (
        <Box mb={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      {client ? (
        <Box>
          <Typography variant="subtitle1">{client.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            CPF/CNPJ: {client.cpfCnpj}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Email: {client.email ?? '-'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Telefone: {client.phone ?? '-'}
          </Typography>
        </Box>
      ) : (
        !error && (
          <Typography variant="body2" color="text.secondary">
            Nenhum cliente selecionado.
          </Typography>
        )
      )}
    </Box>
  );
};

export default ClientDetailPage;
