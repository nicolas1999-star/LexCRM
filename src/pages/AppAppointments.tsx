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

import { attendancesCreate, attendancesDelete, attendancesList, attendancesUpdate } from '../api/attendances';
import type {
  AttendanceChannel,
  AttendancePayload,
  AttendanceSummary
} from '../api/attendances';
import { clientsList, type ClientSummary } from '../api/clients';
import { getErrorMessage } from '../api/errors';
import { t } from '../i18n';
import { useAuth } from '../state/auth';

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

const AppAppointments = () => {
  const { sessionId } = useAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [attendances, setAttendances] = useState<AttendanceSummary[]>([]);
  const [isClientsLoading, setIsClientsLoading] = useState(false);
  const [isAttendancesLoading, setIsAttendancesLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
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

  const canFetch = useMemo(() => !!sessionId, [sessionId]);

  const loadClients = async () => {
    if (!sessionId) return;
    setIsClientsLoading(true);
    setClientsError(null);
    try {
      const data = await clientsList(sessionId, { status: 'ACTIVE' });
      setClients(data);
      if (!selectedClientId && data.length > 0) {
        setSelectedClientId(data[0].id);
      }
    } catch (err) {
      setClientsError(getErrorMessage(err, t('appointments.error.load')));
    } finally {
      setIsClientsLoading(false);
    }
  };

  const loadAttendances = async (clientId: string) => {
    if (!sessionId || !clientId) return;
    setIsAttendancesLoading(true);
    setAttendanceError(null);
    try {
      const data = await attendancesList(sessionId, clientId);
      setAttendances(data);
    } catch (err) {
      setAttendanceError(getErrorMessage(err, t('clientDetail.error.loadAttendances')));
    } finally {
      setIsAttendancesLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadClients();
    }
  }, [canFetch]);

  useEffect(() => {
    if (selectedClientId) {
      void loadAttendances(selectedClientId);
    } else {
      setAttendances([]);
    }
  }, [selectedClientId]);

  const openCreateForm = () => {
    if (!selectedClientId) {
      setToast({ message: t('appointments.toast.nameRequired'), severity: 'warning' });
      return;
    }
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
    if (!sessionId || !selectedClientId) return;
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
        await attendancesCreate(sessionId, selectedClientId, payload);
        setToast({ message: t('clientDetail.toast.created'), severity: 'success' });
      } else if (attendanceForm.id) {
        await attendancesUpdate(sessionId, attendanceForm.id, payload);
        setToast({ message: t('clientDetail.toast.updated'), severity: 'success' });
      }
      setIsFormOpen(false);
      await loadAttendances(selectedClientId);
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
      await loadAttendances(selectedClientId);
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
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {t('app.attendances')}
          </Typography>
          <Button variant="contained" onClick={openCreateForm}>
            {t('clientDetail.button.newAttendance')}
          </Button>
        </Stack>

        {clientsError && <Alert severity="error">{clientsError}</Alert>}

        <FormControl fullWidth disabled={isClientsLoading}>
          <InputLabel>{t('appointments.form.clientName')}</InputLabel>
          <Select
            label={t('appointments.form.clientName')}
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
          >
            {clients.map((client) => (
              <MenuItem key={client.id} value={client.id}>
                {client.name} · {client.cpfCnpj}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
            {!isAttendancesLoading && attendances.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {t('clientDetail.emptyAttendances')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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

export default AppAppointments;
