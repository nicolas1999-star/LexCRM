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
import { t } from '../i18n';

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
  type === 'PF' ? t('client.type.pf') : t('client.type.pj');

const getStatusLabel = (status: ClientStatus) =>
  status === 'ACTIVE' ? t('status.active') : t('status.archived');

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
      setError(getErrorMessage(err, t('clients.error.load')));
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
        message: getErrorMessage(err, t('clients.error.loadDetail')),
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
      setToast({ message: t('clients.toast.typeRequired'), severity: 'error' });
      return;
    }
    if (!trimmedName) {
      setToast({ message: t('clients.toast.nameRequired'), severity: 'error' });
      return;
    }
    if (!digits) {
      setToast({ message: t('clients.toast.documentRequired'), severity: 'error' });
      return;
    }
    if (type === 'PF' && digits.length !== 11) {
      setToast({ message: t('clients.toast.cpfInvalid'), severity: 'error' });
      return;
    }
    if (type === 'PJ' && digits.length !== 14) {
      setToast({ message: t('clients.toast.cnpjInvalid'), severity: 'error' });
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
        setToast({ message: t('clients.toast.created'), severity: 'success' });
      } else if (clientForm.id) {
        await clientsUpdate(sessionId, clientForm.id, payload);
        setToast({ message: t('clients.toast.updated'), severity: 'success' });
      }
      setIsFormOpen(false);
      await loadClients();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('clients.toast.saveError')),
        severity: 'error'
      });
    }
  };

  const handleArchive = async () => {
    if (!sessionId || !archiveTarget) return;
    try {
      await clientsArchive(sessionId, archiveTarget.id);
      setToast({ message: t('clients.toast.archived'), severity: 'success' });
      setArchiveTarget(null);
      await loadClients();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('clients.toast.archiveError')),
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
            {t('clients.title')}
          </Typography>
          <Button variant="contained" onClick={openCreateForm}>
            {t('clients.new')}
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label={t('common.search')}
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>{t('common.type')}</InputLabel>
            <Select
              label={t('common.type')}
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, type: event.target.value }))
              }
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
              {typeOptions.map((type) => (
                <MenuItem key={type} value={type}>
                  {getClientTypeLabel(type)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select
              label={t('common.status')}
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
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
              <TableCell>{t('clients.table.name')}</TableCell>
              <TableCell>{t('clients.table.document')}</TableCell>
              <TableCell>{t('clients.table.type')}</TableCell>
              <TableCell>{t('clients.table.status')}</TableCell>
              <TableCell align="right">{t('common.actions')}</TableCell>
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
                      {t('clients.button.attendances')}
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => openEditForm(client)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      disabled={client.status === 'ARCHIVED'}
                      onClick={() => setArchiveTarget(client)}
                    >
                      {t('clients.button.archive')}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {t('clients.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {formMode === 'create' ? t('clients.dialog.new') : t('clients.dialog.edit')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <FormControl fullWidth>
              <InputLabel>{t('common.type')}</InputLabel>
              <Select
                label={t('common.type')}
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
              label={t('common.name')}
              value={clientForm.name}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, name: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('clients.form.document')}
              value={formatCpfCnpj(clientForm.cpfCnpj)}
              onChange={(event) => handleCpfCnpjChange(event.target.value)}
              fullWidth
            />
            <TextField
              label={t('common.email')}
              type="email"
              value={clientForm.email}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, email: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('common.phone')}
              value={clientForm.phone}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('clients.form.notes')}
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
          <Button onClick={() => setIsFormOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('clients.dialog.archiveTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('clients.dialog.archiveConfirm')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="warning" onClick={handleArchive}>
            {t('clients.button.archive')}
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
