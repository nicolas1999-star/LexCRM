import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { useAuth } from '../state/auth';
import { clientsGet, type ClientDetail, type ClientStatus, type ClientType } from '../api/clients';
import {
  attendancesCreate,
  attendancesDelete,
  attendancesList,
  attendancesUpdate,
  type AttendanceChannel,
  type AttendancePayload,
  type AttendanceSummary,
} from '../api/attendances';
import { getErrorMessage } from '../api/errors';
import { t } from '../i18n';


type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type AttendanceFormState = {
  id?: string;
  occurredAt: string;
  channel: AttendanceChannel | '';
  subject: string;
  notes: string;
};

const channelOptions: AttendanceChannel[] = [
  'PRESENCIAL',
  'WHATSAPP',
  'TELEFONE',
  'EMAIL',
  'VIDEO'
];

const channelLabels: Record<AttendanceChannel, string> = {
  PRESENCIAL: t('attendance.channel.presencial'),
  WHATSAPP: t('attendance.channel.whatsapp'),
  TELEFONE: t('attendance.channel.telefone'),
  EMAIL: t('attendance.channel.email'),
  VIDEO: t('attendance.channel.video')
};

const typeLabels: Record<ClientType, string> = {
  PF: t('client.type.pf'),
  PJ: t('client.type.pj')
};

const statusLabels: Record<ClientStatus, string> = {
  ACTIVE: t('status.active'),
  ARCHIVED: t('status.archived')
};

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

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const toLocalInputValue = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (val: number) => val.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const toIsoFromLocal = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const ClientDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { sessionId } = useAuth();
  const [tabIndex, setTabIndex] = useState(0);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isClientLoading, setIsClientLoading] = useState(false);
  const [attendances, setAttendances] = useState<AttendanceSummary[]>([]);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [attendanceForm, setAttendanceForm] = useState<AttendanceFormState>({
    occurredAt: '',
    channel: '',
    subject: '',
    notes: ''
  });
  const [deleteTarget, setDeleteTarget] = useState<AttendanceSummary | null>(null);

  const canFetch = useMemo(() => !!sessionId && !!id, [sessionId, id]);

  const loadClient = async () => {
    if (!sessionId || !id) return;
    setIsClientLoading(true);
    setClientError(null);
    try {
      const detail = await clientsGet(sessionId, id);
      setClient(detail);
    } catch (err) {
      setClientError(getErrorMessage(err, t('clientDetail.error.loadClient')));
    } finally {
      setIsClientLoading(false);
    }
  };

  const loadAttendances = async () => {
    if (!sessionId || !id) return;
    setIsAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const data = await attendancesList(sessionId, id);
      setAttendances(data);
    } catch (err) {
      setAttendanceError(getErrorMessage(err, t('clientDetail.error.loadAttendances')));
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadClient();
      void loadAttendances();
    }
  }, [canFetch]);

  const openCreateForm = () => {
    setFormMode('create');
    setAttendanceForm({
      occurredAt: toLocalInputValue(new Date().toISOString()),
      channel: '',
      subject: '',
      notes: ''
    });
    setIsFormOpen(true);
  };

  const openEditForm = (attendance: AttendanceSummary) => {
    setFormMode('edit');
    setAttendanceForm({
      id: attendance.id,
      occurredAt: toLocalInputValue(attendance.occurredAt),
      channel: attendance.channel,
      subject: attendance.subject,
      notes: attendance.notes
    });
    setIsFormOpen(true);
  };

  const handleSaveAttendance = async () => {
    if (!sessionId || !id) return;
    const occurredAtIso = toIsoFromLocal(attendanceForm.occurredAt);
    if (!occurredAtIso) {
      setToast({ message: t('clientDetail.toast.dateRequired'), severity: 'error' });
      return;
    }
    if (!attendanceForm.channel) {
      setToast({ message: t('clientDetail.toast.channelRequired'), severity: 'error' });
      return;
    }
    if (!attendanceForm.subject.trim()) {
      setToast({ message: t('clientDetail.toast.subjectRequired'), severity: 'error' });
      return;
    }
    if (!attendanceForm.notes.trim()) {
      setToast({ message: t('clientDetail.toast.notesRequired'), severity: 'error' });
      return;
    }

    const payload: AttendancePayload = {
      occurredAt: occurredAtIso,
      channel: attendanceForm.channel as AttendanceChannel,
      subject: attendanceForm.subject.trim(),
      notes: attendanceForm.notes.trim()
    };

    try {
      if (formMode === 'create') {
        await attendancesCreate(sessionId, id, payload);
        setToast({ message: t('clientDetail.toast.created'), severity: 'success' });
      } else if (attendanceForm.id) {
        await attendancesUpdate(sessionId, attendanceForm.id, payload);
        setToast({ message: t('clientDetail.toast.updated'), severity: 'success' });
      }
      setIsFormOpen(false);
      await loadAttendances();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('clientDetail.toast.saveError')),
        severity: 'error'
      });
    }
  };

  const handleDeleteAttendance = async () => {
    if (!sessionId || !deleteTarget) return;
    try {
      await attendancesDelete(sessionId, deleteTarget.id);
      setToast({ message: t('clientDetail.toast.removed'), severity: 'success' });
      setDeleteTarget(null);
      await loadAttendances();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, t('clientDetail.toast.removeError')),
        severity: 'error'
      });
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4">{t('clientDetail.title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {client
                ? `${client.name} · ${formatCpfCnpj(client.cpfCnpj)}`
                : t('common.loadingData')}
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => navigate('/admin/clients')}>
            {t('app.backToClients')}
          </Button>
        </Stack>

        {clientError && <Alert severity="error">{clientError}</Alert>}

        <Paper variant="outlined">
          <Tabs value={tabIndex} onChange={(_, value) => setTabIndex(value)}>
            <Tab label={t('clientDetail.tabs.data')} />
            <Tab label={t('clientDetail.tabs.attendances')} />
          </Tabs>
          <Divider />
          <Box sx={{ p: 3 }}>
            {tabIndex === 0 && (
              <Stack spacing={2}>
                {isClientLoading && <Typography>{t('common.loadingClientData')}</Typography>}
                {client && (
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('clientDetail.label.type')}
                        </Typography>
                        <Typography>{typeLabels[client.type]}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('clientDetail.label.status')}
                        </Typography>
                        <Typography>{statusLabels[client.status]}</Typography>
                      </Paper>
                    </Stack>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('clientDetail.label.email')}
                        </Typography>
                        <Typography>{client.email || t('common.notInformed')}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('clientDetail.label.phone')}
                        </Typography>
                        <Typography>{client.phone || t('common.notInformed')}</Typography>
                      </Paper>
                    </Stack>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('clientDetail.label.notes')}
                      </Typography>
                      <Typography>{client.notes || t('clientDetail.value.noNotes')}</Typography>
                    </Paper>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('clientDetail.label.createdAt')}
                        </Typography>
                        <Typography>{formatDateTime(client.createdAt)}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('clientDetail.label.updatedAt')}
                        </Typography>
                        <Typography>{formatDateTime(client.updatedAt)}</Typography>
                      </Paper>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            )}

            {tabIndex === 1 && (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {t('clientDetail.section.attendances')}
                  </Typography>
                  <Button variant="contained" onClick={openCreateForm}>
                    {t('clientDetail.button.newAttendance')}
                  </Button>
                </Stack>

                {attendanceError && <Alert severity="error">{attendanceError}</Alert>}

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('clientDetail.table.dateTime')}</TableCell>
                      <TableCell>{t('clientDetail.table.channel')}</TableCell>
                      <TableCell>{t('clientDetail.table.subject')}</TableCell>
                      <TableCell>{t('clientDetail.table.notes')}</TableCell>
                      <TableCell align="right">{t('clientDetail.table.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {attendances.map((attendance) => (
                      <TableRow key={attendance.id} hover>
                        <TableCell>{formatDateTime(attendance.occurredAt)}</TableCell>
                        <TableCell>{channelLabels[attendance.channel]}</TableCell>
                        <TableCell>{attendance.subject}</TableCell>
                        <TableCell>{attendance.notes}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => openEditForm(attendance)}
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => setDeleteTarget(attendance)}
                            >
                              {t('common.remove')}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isAttendanceLoading && attendances.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          {t('clientDetail.emptyAttendances')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Stack>
            )}
          </Box>
        </Paper>
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {formMode === 'create' ? t('clientDetail.dialog.new') : t('clientDetail.dialog.edit')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label={t('clientDetail.form.dateTime')}
              type="datetime-local"
              value={attendanceForm.occurredAt}
              onChange={(event) =>
                setAttendanceForm((prev) => ({ ...prev, occurredAt: event.target.value }))
              }
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>{t('clientDetail.form.channel')}</InputLabel>
              <Select
                label={t('clientDetail.form.channel')}
                value={attendanceForm.channel}
                onChange={(event) =>
                  setAttendanceForm((prev) => ({
                    ...prev,
                    channel: event.target.value as AttendanceChannel
                  }))
                }
              >
                {channelOptions.map((channel) => (
                  <MenuItem key={channel} value={channel}>
                    {channelLabels[channel]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={t('clientDetail.form.subject')}
              value={attendanceForm.subject}
              onChange={(event) =>
                setAttendanceForm((prev) => ({ ...prev, subject: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label={t('clientDetail.form.notes')}
              value={attendanceForm.notes}
              onChange={(event) =>
                setAttendanceForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSaveAttendance}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('clientDetail.dialog.removeTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('clientDetail.dialog.removeConfirm')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteAttendance}>
            {t('common.remove')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert onClose={() => setToast(null)} severity={toast?.severity ?? 'info'} variant="filled">
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ClientDetailPage;
