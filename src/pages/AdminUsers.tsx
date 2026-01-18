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
import { authReauthCheck } from '../api/auth';
import { getErrorMessage } from '../api/errors';
import { getRoleLabel } from '../constants/roles';
import { t } from '../i18n';

const roleOptions = Object.values(Role);
const statusOptions: UserStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

const statusLabels: Record<UserStatus, string> = {
  ACTIVE: t('status.active'),
  INACTIVE: t('status.inactive'),
  SUSPENDED: t('status.suspended')
};

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';

const generatePassword = () => {
  const length = 12 + Math.floor(Math.random() * 5);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const values = new Uint32Array(length);
    window.crypto.getRandomValues(values);
    return Array.from(values)
      .map((value) => PASSWORD_CHARSET[value % PASSWORD_CHARSET.length])
      .join('');
  }
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * PASSWORD_CHARSET.length);
    return PASSWORD_CHARSET[index];
  }).join('');
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
      setError(getErrorMessage(err, t('users.error.load')));
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
    const trimmedName = userForm.name.trim();
    const trimmedEmail = userForm.email.trim();
    if (!trimmedName) {
      setToast({ message: t('users.toast.nameRequired'), severity: 'error' });
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setToast({ message: t('users.toast.emailInvalid'), severity: 'error' });
      return;
    }
    let password = '';
    if (formMode === 'create') {
      password = userForm.passwordInitial?.trim() ?? '';
      if (!password) {
        setToast({ message: t('users.toast.initialPasswordRequired'), severity: 'error' });
        return;
      }
      if (password.length < 8) {
        setToast({
          message: t('users.toast.initialPasswordLength'),
          severity: 'error'
        });
        return;
      }
    }
    try {
      if (formMode === 'create') {
        await usersCreate(sessionId, {
          name: trimmedName,
          email: trimmedEmail,
          role: userForm.role,
          passwordInitial: password
        });
        setToast({ message: t('users.toast.created'), severity: 'success' });
      } else if (userForm.id) {
        await usersUpdate(sessionId, userForm.id, {
          name: trimmedName,
          email: trimmedEmail,
          role: userForm.role
        });
        setToast({ message: t('users.toast.updated'), severity: 'success' });
      }
      setIsFormOpen(false);
      await loadUsers();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('users.toast.saveError')),
        severity: 'error'
      });
    }
  };

  const handleToggleStatus = async (user: UserDetail) => {
    if (!sessionId) return;
    const nextStatus: UserStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await usersSetStatus(sessionId, user.id, nextStatus);
      setToast({ message: t('users.toast.statusUpdated'), severity: 'success' });
      await loadUsers();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('users.toast.statusError')),
        severity: 'error'
      });
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
      setToast({ message: t('users.toast.passwordReset'), severity: 'success' });
      setResetForm(null);
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('users.toast.passwordResetError')),
        severity: 'error'
      });
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('users.title')}
          </Typography>
          <Button variant="contained" onClick={openCreateForm}>
            {t('users.new')}
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
            <InputLabel>{t('common.role')}</InputLabel>
            <Select
              value={filters.role}
              label={t('common.role')}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, role: event.target.value }))
              }
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
              {roleOptions.map((role) => (
                <MenuItem key={role} value={role}>
                  {getRoleLabel(role)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select
              value={filters.status}
              label={t('common.status')}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <MenuItem value="">{t('common.all')}</MenuItem>
              {statusOptions.map((status) => (
                <MenuItem key={status} value={status}>
                  {statusLabels[status]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('users.table.name')}</TableCell>
              <TableCell>{t('users.table.email')}</TableCell>
              <TableCell>{t('users.table.role')}</TableCell>
              <TableCell>{t('users.table.status')}</TableCell>
              <TableCell align="right">{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{getRoleLabel(user.role)}</TableCell>
                <TableCell>{statusLabels[user.status]}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" variant="outlined" onClick={() => openEditForm(user)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color={user.status === 'ACTIVE' ? 'warning' : 'success'}
                      onClick={() => handleToggleStatus(user)}
                    >
                      {user.status === 'ACTIVE'
                        ? t('users.button.deactivate')
                        : t('users.button.activate')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      onClick={() => handleResetPassword(user)}
                    >
                      {t('users.button.resetPassword')}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {t('users.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {formMode === 'create' ? t('users.dialog.new') : t('users.dialog.edit')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label={t('common.name')}
              value={userForm.name}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, name: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('common.email')}
              type="email"
              value={userForm.email}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, email: event.target.value }))
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>{t('common.role')}</InputLabel>
              <Select
                value={userForm.role}
                label={t('common.role')}
                onChange={(event) =>
                  setUserForm((prev) => ({ ...prev, role: event.target.value as Role }))
                }
              >
                {roleOptions.map((role) => (
                  <MenuItem key={role} value={role}>
                    {getRoleLabel(role)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {formMode === 'create' && (
              <Stack spacing={1}>
                <TextField
                  label={t('users.form.initialPassword')}
                  type="password"
                  value={userForm.passwordInitial}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, passwordInitial: event.target.value }))
                  }
                  fullWidth
                  required
                />
                <Box display="flex" justifyContent="flex-end">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      setUserForm((prev) => ({
                        ...prev,
                        passwordInitial: generatePassword()
                      }))
                    }
                  >
                    {t('users.form.generatePassword')}
                  </Button>
                </Box>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleFormSubmit}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!resetForm} onClose={() => setResetForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t('users.dialog.resetPassword')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label={t('users.form.currentPassword')}
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
              label={t('users.form.newPassword')}
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
          <Button onClick={() => setResetForm(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleConfirmReset}>
            {t('common.confirm')}
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
