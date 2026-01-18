import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/auth';
import {
  clientsArchive,
  clientsCreate,
  clientsGet,
  clientsList,
  clientsUpdate,
  type ClientStatus,
  type ClientSummary,
  type ClientType
} from '../api/clients';
import { getErrorMessage } from '../api/errors';

type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type ClientFormState = {
  id?: string;
  type: ClientType | '';
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  notes: string;
};

const typeOptions: ClientType[] = ['PF', 'PJ'];
const statusOptions: ClientStatus[] = ['ACTIVE', 'ARCHIVED'];

const formatCpf = (digits: string) => {
  const value = digits.slice(0, 11);
  if (value.length <= 3) return value;
  if (value.length <= 6) return `${value.slice(0, 3)}.${value.slice(3)}`;
  if (value.length <= 9) return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6)}`;
  return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(
    9,
    11
  )}`;
};

const formatCnpj = (digits: string) => {
  const value = digits.slice(0, 14);
  if (value.length <= 2) return value;
  if (value.length <= 5) return `${value.slice(0, 2)}.${value.slice(2)}`;
  if (value.length <= 8) return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5)}`;
  if (value.length <= 12) {
    return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8)}`;
  }
  return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(
    8,
    12
  )}-${value.slice(12, 14)}`;
};

const formatCpfCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 11) {
    return formatCpf(digits);
  }
  return formatCnpj(digits);
};

const getClientTypeLabel = (type: ClientType) =>
  type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica';

const getStatusLabel = (status: ClientStatus) => (status === 'ACTIVE' ? 'Ativo' : 'Arquivado');

const AdminClients = () => {
  const { sessionId } = useAuth();
  const [filters, setFilters] = useState({
    q: '',
    type: '',
    status: 'ACTIVE'
  });
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [clientForm, setClientForm] = useState<ClientFormState>({
    type: '',
    name: '',
    cpfCnpj: '',
    email: '',
    phone: '',
    notes: ''
  });
  const [archiveTarget, setArchiveTarget] = useState<ClientSummary | null>(null);

  const canFetch = useMemo(() => !!sessionId, [sessionId]);

  const loadClients = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await clientsList(sessionId, {
        q: filters.q,
        type: (filters.type as ClientType) || undefined,
        status: (filters.status as ClientStatus) || undefined
      });
      setClients(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar clientes.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadClients();
    }
  }, [canFetch, filters.q, filters.type, filters.status]);

  const openCreateForm = () => {
    setFormMode('create');
    setClientForm({
      type: '',
      name: '',
      cpfCnpj: '',
      email: '',
      phone: '',
      notes: ''
    });
    setIsFormOpen(true);
  };

  const openEditForm = async (client: ClientSummary) => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const detail = await clientsGet(sessionId, client.id);
      setFormMode('edit');
      setClientForm({
        id: detail.id,
        type: detail.type,
        name: detail.name,
        cpfCnpj: detail.cpfCnpj,
        email: detail.email ?? '',
        phone: detail.phone ?? '',
        notes: detail.notes ?? ''
      });
      setIsFormOpen(true);
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Falha ao carregar cliente.'),
        severity: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    const trimmedName = clientForm.name.trim();
    const digits = clientForm.cpfCnpj.replace(/\D/g, '');
    const type = clientForm.type as ClientType;
    if (!type) {
      setToast({ message: 'Informe o tipo de cliente.', severity: 'error' });
      return;
    }
    if (!trimmedName) {
      setToast({ message: 'Informe o nome do cliente.', severity: 'error' });
      return;
    }
    if (!digits) {
      setToast({ message: 'CPF/CNPJ é obrigatório.', severity: 'error' });
      return;
    }
    if (type === 'PF' && digits.length !== 11) {
      setToast({ message: 'CPF inválido.', severity: 'error' });
      return;
    }
    if (type === 'PJ' && digits.length !== 14) {
      setToast({ message: 'CNPJ inválido.', severity: 'error' });
      return;
    }
    const payload = {
      type,
      name: trimmedName,
      cpfCnpj: digits,
      email: clientForm.email.trim() || undefined,
      phone: clientForm.phone.trim() || undefined,
      notes: clientForm.notes.trim() || undefined
    };
    try {
      if (formMode === 'create') {
        await clientsCreate(sessionId, payload);
        setToast({ message: 'Cliente criado.', severity: 'success' });
      } else if (clientForm.id) {
        await clientsUpdate(sessionId, clientForm.id, payload);
        setToast({ message: 'Cliente atualizado.', severity: 'success' });
      }
      setIsFormOpen(false);
      await loadClients();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Falha ao salvar cliente.'),
        severity: 'error'
      });
    }
  };

  const handleArchive = async () => {
    if (!sessionId || !archiveTarget) return;
    try {
      await clientsArchive(sessionId, archiveTarget.id);
      setToast({ message: 'Cliente arquivado.', severity: 'success' });
      setArchiveTarget(null);
      await loadClients();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Falha ao arquivar cliente.'),
        severity: 'error'
      });
    }
  };

  const handleToastClose = () => setToast(null);

  const handleCpfCnpjChange = (value: string) => {
    setClientForm((prev) => ({ ...prev, cpfCnpj: value.replace(/\D/g, '') }));
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            Clientes
          </Typography>
          <Button variant="contained" onClick={openCreateForm}>
            Novo cliente
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Busca"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>Tipo</InputLabel>
            <Select
              label="Tipo"
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, type: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              {typeOptions.map((type) => (
                <MenuItem key={type} value={type}>
                  {getClientTypeLabel(type)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              {statusOptions.map((status) => (
                <MenuItem key={status} value={status}>
                  {getStatusLabel(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome / Razão social</TableCell>
              <TableCell>CPF/CNPJ</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id} hover>
                <TableCell>{client.name}</TableCell>
                <TableCell>{formatCpfCnpj(client.cpfCnpj)}</TableCell>
                <TableCell>{getClientTypeLabel(client.type)}</TableCell>
                <TableCell>{getStatusLabel(client.status)}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      variant="outlined"
                      component={Link}
                      to={`/clients/${client.id}`}
                    >
                      Atendimentos
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => openEditForm(client)}>
                      Editar
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      disabled={client.status === 'ARCHIVED'}
                      onClick={() => setArchiveTarget(client)}
                    >
                      Arquivar
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{formMode === 'create' ? 'Novo cliente' : 'Editar cliente'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <FormControl fullWidth>
              <InputLabel>Tipo</InputLabel>
              <Select
                label="Tipo"
                value={clientForm.type}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    type: event.target.value as ClientType
                  }))
                }
              >
                {typeOptions.map((type) => (
                  <MenuItem key={type} value={type}>
                    {getClientTypeLabel(type)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Nome"
              value={clientForm.name}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, name: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="CPF/CNPJ"
              value={formatCpfCnpj(clientForm.cpfCnpj)}
              onChange={(event) => handleCpfCnpjChange(event.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={clientForm.email}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, email: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Telefone"
              value={clientForm.phone}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Observações"
              value={clientForm.notes}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSubmit}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Arquivar cliente</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja arquivar este cliente? Ele continuará disponível no histórico.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveTarget(null)}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={handleArchive}>
            Arquivar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={handleToastClose}>
        <Alert onClose={handleToastClose} severity={toast?.severity ?? 'info'} variant="filled">
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AdminClients;
