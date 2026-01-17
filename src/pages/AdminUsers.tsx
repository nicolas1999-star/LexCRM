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
import { useAuth, Role } from '../state/auth';
import {
  usersCreate,
  usersList,
  usersResetPassword,
  usersSetStatus,
  usersUpdate,
  type UserDetail,
  type UserStatus
} from '../api/users';
import { authReauthCheck, type AppError } from '../api/auth';

const roleOptions = Object.values(Role);
const statusOptions: UserStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  role: Role;
  passwordInitial?: string;
};

type ResetFormState = {
  userId: string;
  currentPassword: string;
  newPassword: string;
};

const AdminUsers = () => {
  const { sessionId } = useAuth();
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [users, setUsers] = useState<UserDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [userForm, setUserForm] = useState<UserFormState>({
    name: '',
    email: '',
    role: Role.COORDINATOR,
    passwordInitial: ''
  });
  const [resetForm, setResetForm] = useState<ResetFormState | null>(null);

  const canFetch = useMemo(() => !!sessionId, [sessionId]);

  const loadUsers = async () => {
    if (!sessionId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await usersList(sessionId, {
        q: filters.q,
        role: (filters.role as Role) || undefined,
        status: (filters.status as UserStatus) || undefined
      });
      setUsers(data);
    } catch (err) {
      const message = (err as AppError)?.message ?? 'Falha ao carregar usuários.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      loadUsers();
    }
  }, [canFetch, filters.q, filters.role, filters.status]);

  const handleToastClose = () => setToast(null);

  const openCreateForm = () => {
    setFormMode('create');
    setUserForm({
      name: '',
      email: '',
      role: Role.COORDINATOR,
      passwordInitial: ''
    });
    setIsFormOpen(true);
  };

  const openEditForm = (user: UserDetail) => {
    setFormMode('edit');
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });
    setIsFormOpen(true);
  };

  const handleFormSubmit = async () => {
    if (!sessionId) return;
    try {
      if (formMode === 'create') {
        await usersCreate(sessionId, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          passwordInitial: userForm.passwordInitial || ''
        });
        setToast({ message: 'Usuário criado com sucesso.', severity: 'success' });
      } else if (userForm.id) {
        await usersUpdate(sessionId, userForm.id, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role
        });
        setToast({ message: 'Usuário atualizado com sucesso.', severity: 'success' });
      }
      setIsFormOpen(false);
      await loadUsers();
    } catch (err) {
      const message = (err as AppError)?.message ?? 'Falha ao salvar usuário.';
      setToast({ message, severity: 'error' });
    }
  };

  const handleToggleStatus = async (user: UserDetail) => {
    if (!sessionId) return;
    const nextStatus: UserStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await usersSetStatus(sessionId, user.id, nextStatus);
      setToast({ message: 'Status atualizado.', severity: 'success' });
      await loadUsers();
    } catch (err) {
      const message = (err as AppError)?.message ?? 'Falha ao alterar status.';
      setToast({ message, severity: 'error' });
    }
  };

  const handleResetPassword = (user: UserDetail) => {
    setResetForm({ userId: user.id, currentPassword: '', newPassword: '' });
  };

  const handleConfirmReset = async () => {
    if (!sessionId || !resetForm) return;
    try {
      await authReauthCheck(sessionId, resetForm.currentPassword);
      await usersResetPassword(sessionId, resetForm.userId, resetForm.newPassword);
      setToast({ message: 'Senha redefinida.', severity: 'success' });
      setResetForm(null);
    } catch (err) {
      const message = (err as AppError)?.message ?? 'Falha ao redefinir senha.';
      setToast({ message, severity: 'error' });
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            Usuários
          </Typography>
          <Button variant="contained" onClick={openCreateForm}>
            Novo usuário
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
            <InputLabel>Role</InputLabel>
            <Select
              value={filters.role}
              label="Role"
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, role: event.target.value }))
              }
            >
              <MenuItem value="">Todas</MenuItem>
              {roleOptions.map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              {statusOptions.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.status}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" variant="outlined" onClick={() => openEditForm(user)}>
                      Editar
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color={user.status === 'ACTIVE' ? 'warning' : 'success'}
                      onClick={() => handleToggleStatus(user)}
                    >
                      {user.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      onClick={() => handleResetPassword(user)}
                    >
                      Reset senha
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{formMode === 'create' ? 'Novo usuário' : 'Editar usuário'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nome"
              value={userForm.name}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, name: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={userForm.email}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, email: event.target.value }))
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={userForm.role}
                label="Role"
                onChange={(event) =>
                  setUserForm((prev) => ({ ...prev, role: event.target.value as Role }))
                }
              >
                {roleOptions.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {formMode === 'create' && (
              <TextField
                label="Senha inicial"
                type="password"
                value={userForm.passwordInitial}
                onChange={(event) =>
                  setUserForm((prev) => ({ ...prev, passwordInitial: event.target.value }))
                }
                fullWidth
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleFormSubmit}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!resetForm} onClose={() => setResetForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>Redefinir senha</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Sua senha"
              type="password"
              value={resetForm?.currentPassword ?? ''}
              onChange={(event) =>
                setResetForm((prev) =>
                  prev ? { ...prev, currentPassword: event.target.value } : prev
                )
              }
              fullWidth
            />
            <TextField
              label="Nova senha"
              type="password"
              value={resetForm?.newPassword ?? ''}
              onChange={(event) =>
                setResetForm((prev) =>
                  prev ? { ...prev, newPassword: event.target.value } : prev
                )
              }
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleConfirmReset}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast && (
          <Alert severity={toast.severity} variant="filled" onClose={handleToastClose}>
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
};

export default AdminUsers;
