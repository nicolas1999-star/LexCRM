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
import { useAuth } from '../state/auth';
import {
  teamsCreate,
  teamsDelete,
  teamsList,
  teamsSetMembers,
  teamsUpdate,
  type Team
} from '../api/teams';
import { usersList, type UserSummary } from '../api/users';
import { getErrorMessage } from '../api/errors';
import { t } from '../i18n';

type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type TeamFormState = {
  id?: string;
  name: string;
  description: string;
  leadUserId: string;
  memberUserIds: string[];
};

const AdminTeams = () => {
  const { sessionId } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [teamForm, setTeamForm] = useState<TeamFormState>({
    name: '',
    description: '',
    leadUserId: '',
    memberUserIds: []
  });
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const canFetch = useMemo(() => !!sessionId, [sessionId]);

  const loadData = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [teamsData, usersData] = await Promise.all([
        teamsList(sessionId),
        usersList(sessionId, {})
      ]);
      setTeams(teamsData);
      setUsers(usersData);
    } catch (err) {
      setError(getErrorMessage(err, t('teams.error.load')));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadData();
    }
  }, [canFetch]);

  const openCreateForm = () => {
    setFormMode('create');
    setTeamForm({ name: '', description: '', leadUserId: '', memberUserIds: [] });
    setIsFormOpen(true);
  };

  const openEditForm = (team: Team) => {
    setFormMode('edit');
    setTeamForm({
      id: team.id,
      name: team.name,
      description: team.description ?? '',
      leadUserId: team.leadUserId ?? '',
      memberUserIds: team.memberUserIds
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    try {
      if (formMode === 'create') {
        await teamsCreate(sessionId, {
          name: teamForm.name,
          description: teamForm.description || undefined,
          leadUserId: teamForm.leadUserId || undefined,
          memberUserIds: teamForm.memberUserIds
        });
        setToast({ message: t('teams.toast.created'), severity: 'success' });
      } else if (teamForm.id) {
        await teamsUpdate(sessionId, teamForm.id, {
          name: teamForm.name,
          description: teamForm.description || undefined,
          leadUserId: teamForm.leadUserId || undefined
        });
        await teamsSetMembers(sessionId, teamForm.id, teamForm.memberUserIds);
        setToast({ message: t('teams.toast.updated'), severity: 'success' });
      }
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('teams.toast.saveError')),
        severity: 'error'
      });
    }
  };

  const handleDelete = async () => {
    if (!sessionId || !deleteTarget) return;
    try {
      await teamsDelete(sessionId, deleteTarget.id);
      setToast({ message: t('teams.toast.removed'), severity: 'success' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('teams.toast.removeError')),
        severity: 'error'
      });
    }
  };

  const leadOptions = useMemo(() => users, [users]);

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('teams.title')}
          </Typography>
          <Button variant="contained" onClick={openCreateForm}>
            {t('teams.new')}
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('teams.table.team')}</TableCell>
              <TableCell>{t('teams.table.lead')}</TableCell>
              <TableCell>{t('teams.table.members')}</TableCell>
              <TableCell align="right">{t('teams.table.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((team) => (
              <TableRow key={team.id} hover>
                <TableCell>
                  <Typography fontWeight={600}>{team.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {team.description || t('teams.noDescription')}
                  </Typography>
                </TableCell>
                <TableCell>
                  {team.leadName
                    ? `${team.leadName} (${team.leadEmail ?? t('teams.noEmail')})`
                    : t('teams.notDefined')}
                </TableCell>
                <TableCell>{team.memberCount}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" variant="outlined" onClick={() => openEditForm(team)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => setDeleteTarget(team)}
                    >
                      {t('common.remove')}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  {t('teams.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {formMode === 'create' ? t('teams.dialog.new') : t('teams.dialog.edit')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label={t('common.name')}
              value={teamForm.name}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <TextField
              label={t('teams.form.description')}
              value={teamForm.description}
              onChange={(event) =>
                setTeamForm((prev) => ({ ...prev, description: event.target.value }))
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>{t('teams.form.lead')}</InputLabel>
              <Select
                value={teamForm.leadUserId}
                label={t('teams.form.lead')}
                onChange={(event) =>
                  setTeamForm((prev) => ({ ...prev, leadUserId: event.target.value }))
                }
              >
                <MenuItem value="">{t('teams.form.noLead')}</MenuItem>
                {leadOptions.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>{t('teams.form.members')}</InputLabel>
              <Select
                multiple
                value={teamForm.memberUserIds}
                label={t('teams.form.members')}
                onChange={(event) =>
                  setTeamForm((prev) => ({
                    ...prev,
                    memberUserIds:
                      typeof event.target.value === 'string'
                        ? event.target.value.split(',')
                        : event.target.value
                  }))
                }
                renderValue={(selected) =>
                  (selected as string[])
                    .map((id) => users.find((user) => user.id === id)?.name || id)
                    .join(', ')
                }
              >
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('teams.dialog.removeTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('teams.dialog.removeConfirm')} {deleteTarget?.name}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            {t('common.remove')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast && (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
};

export default AdminTeams;
