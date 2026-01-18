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
import {
  documentsCreateDraft,
  documentsExportPdf,
  documentsSign
} from '../api/documents';
import type { DocumentStatus, DocumentType } from '../api/documents';
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

type DocumentFormState = {
  attendanceId: string;
  attendanceDate: string;
  documentType: DocumentType;
  officeName: string;
  lawyerName: string;
  lawyerOab: string;
  title: string;
  history: string;
  analysis: string;
  conclusion: string;
};

type DocumentPreviewState = {
  documentId: string;
  html: string;
  status: DocumentStatus;
  hashHtml?: string | null;
  hashPdf?: string | null;
  filePath?: string | null;
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
  const { sessionId, user } = useAuth();
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
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [documentForm, setDocumentForm] = useState<DocumentFormState | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);
  const [isDocumentGenerating, setIsDocumentGenerating] = useState(false);
  const [isDocumentSigning, setIsDocumentSigning] = useState(false);
  const [isDocumentExporting, setIsDocumentExporting] = useState(false);

  const canFetch = useMemo(() => !!sessionId, [sessionId]);
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

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

  const openDocumentDialog = (attendance: AttendanceSummary) => {
    if (!selectedClient) {
      setToast({ message: 'Selecione um cliente antes de gerar documento.', severity: 'warning' });
      return;
    }
    const lawyerOab = user?.oabNumber && user?.oabUf ? `${user.oabUf} ${user.oabNumber}` : '';
    setDocumentForm({
      attendanceId: attendance.id,
      attendanceDate: formatDateTime(attendance.occurredAt),
      documentType: 'RELATORIO',
      officeName: '',
      lawyerName: user?.name ?? '',
      lawyerOab,
      title: attendance.subject,
      history: attendance.notes,
      analysis: '',
      conclusion: ''
    });
    setDocumentPreview(null);
    setIsDocumentDialogOpen(true);
  };

  const handleGenerateDocument = async () => {
    if (!sessionId || !documentForm || !selectedClient) return;
    if (!documentForm.officeName.trim()) {
      setToast({ message: 'Informe o nome do escritório.', severity: 'error' });
      return;
    }
    if (!documentForm.title.trim()) {
      setToast({ message: 'Informe o título do documento.', severity: 'error' });
      return;
    }
    setIsDocumentGenerating(true);
    try {
      const response = await documentsCreateDraft(sessionId, {
        documentType: documentForm.documentType,
        officeName: documentForm.officeName.trim(),
        generatedAt: new Date().toLocaleString('pt-BR'),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        clientDocument: selectedClient.cpfCnpj,
        title: documentForm.title.trim(),
        attendanceDate: documentForm.attendanceDate,
        history: documentForm.history.trim(),
        analysis: documentForm.analysis.trim(),
        conclusion: documentForm.conclusion.trim(),
        appointmentId: documentForm.attendanceId
      });
      setDocumentPreview({
        documentId: response.documentId,
        html: response.html,
        status: response.status
      });
      setToast({ message: 'Documento gerado em rascunho.', severity: 'success' });
    } catch (err) {
      setToast({ message: getErrorMessage(err, t('appointments.toast.generateError')), severity: 'error' });
    } finally {
      setIsDocumentGenerating(false);
    }
  };

  const handleCopyDocumentHash = () => {
    if (!documentPreview?.hashHtml) return;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(documentPreview.hashHtml);
      setToast({ message: 'Hash copiado para a área de transferência.', severity: 'success' });
    } else {
      setToast({ message: 'Não foi possível copiar o hash.', severity: 'warning' });
    }
  };

  const handleSignDocument = async () => {
    if (!sessionId || !documentPreview || !documentForm) return;
    if (!documentForm.lawyerName.trim() || !documentForm.lawyerOab.trim()) {
      setToast({ message: 'Informe o advogado responsável e a OAB.', severity: 'error' });
      return;
    }
    setIsDocumentSigning(true);
    try {
      const response = await documentsSign(
        sessionId,
        documentPreview.documentId,
        documentForm.lawyerName.trim(),
        documentForm.lawyerOab.trim()
      );
      setDocumentPreview((prev) =>
        prev
          ? {
              ...prev,
              html: response.htmlSigned,
              hashHtml: response.hashHtml,
              status: response.status
            }
          : prev
      );
      setToast({ message: 'Documento assinado com sucesso.', severity: 'success' });
    } catch (err) {
      setToast({ message: 'Falha ao assinar documento.', severity: 'error' });
    } finally {
      setIsDocumentSigning(false);
    }
  };

  const handleExportDocument = async () => {
    if (!sessionId || !documentPreview) return;
    setIsDocumentExporting(true);
    try {
      const response = await documentsExportPdf(sessionId, documentPreview.documentId);
      setDocumentPreview((prev) =>
        prev
          ? {
              ...prev,
              hashPdf: response.hashPdf,
              filePath: response.filePath,
              status: response.status
            }
          : prev
      );
      setToast({ message: 'Documento exportado com sucesso.', severity: 'success' });
    } catch (err) {
      setToast({ message: 'Falha ao exportar documento.', severity: 'error' });
    } finally {
      setIsDocumentExporting(false);
    }
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
                      onClick={() => openDocumentDialog(attendance)}
                    >
                      Gerar documento
                    </Button>
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

      <Dialog
        open={isDocumentDialogOpen}
        onClose={() => setIsDocumentDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Gerar documento</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Formato: ABNT (A4)
          </Typography>
          {documentForm && (
            <Stack spacing={2} mt={1}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  label="Tipo"
                  value={documentForm.documentType}
                  onChange={(event) =>
                    setDocumentForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            documentType: event.target.value as DocumentType
                          }
                        : prev
                    )
                  }
                >
                  <MenuItem value="RELATORIO">Relatório</MenuItem>
                  <MenuItem value="PARECER">Parecer</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Escritório"
                value={documentForm.officeName}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, officeName: event.target.value } : prev
                  )
                }
                fullWidth
              />
              <TextField
                label="Advogado responsável"
                value={documentForm.lawyerName}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, lawyerName: event.target.value } : prev
                  )
                }
                fullWidth
              />
              <TextField
                label="OAB"
                value={documentForm.lawyerOab}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, lawyerOab: event.target.value } : prev
                  )
                }
                fullWidth
              />
              <TextField
                label="Título"
                value={documentForm.title}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, title: event.target.value } : prev
                  )
                }
                fullWidth
              />
              <TextField
                label="Histórico dos fatos"
                value={documentForm.history}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, history: event.target.value } : prev
                  )
                }
                fullWidth
                multiline
                minRows={3}
              />
              <TextField
                label="Análise jurídica"
                value={documentForm.analysis}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, analysis: event.target.value } : prev
                  )
                }
                fullWidth
                multiline
                minRows={3}
              />
              <TextField
                label="Conclusão"
                value={documentForm.conclusion}
                onChange={(event) =>
                  setDocumentForm((prev) =>
                    prev ? { ...prev, conclusion: event.target.value } : prev
                  )
                }
                fullWidth
                multiline
                minRows={3}
              />
            </Stack>
          )}

          {documentPreview && (
            <Box mt={3}>
              <Typography variant="subtitle1" gutterBottom>
                Documento em visualização
              </Typography>
              <Stack spacing={1} mb={2}>
                <Typography variant="body2">Status: {documentPreview.status}</Typography>
                {documentPreview.hashHtml && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">Hash SHA-256 (HTML):</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {documentPreview.hashHtml}
                    </Typography>
                    <Button size="small" onClick={handleCopyDocumentHash}>
                      Copiar
                    </Button>
                  </Stack>
                )}
                {documentPreview.hashPdf && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">Hash SHA-256 (PDF):</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {documentPreview.hashPdf}
                    </Typography>
                  </Stack>
                )}
                {documentPreview.filePath && (
                  <Typography variant="body2">Arquivo: {documentPreview.filePath}</Typography>
                )}
              </Stack>
              <Box mt={2} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <iframe
                  title={t('appointments.preview.iframeTitle')}
                  srcDoc={documentPreview.html}
                  style={{ width: '100%', height: 360, border: 'none' }}
                />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDocumentDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="outlined" onClick={handleGenerateDocument} disabled={isDocumentGenerating}>
            {isDocumentGenerating ? 'Gerando...' : 'Gerar rascunho'}
          </Button>
          <Button
            variant="outlined"
            onClick={handleSignDocument}
            disabled={
              !documentPreview ||
              documentPreview.status !== 'DRAFT' ||
              isDocumentSigning
            }
          >
            {isDocumentSigning ? 'Assinando...' : 'Assinar'}
          </Button>
          <Button
            variant="contained"
            onClick={handleExportDocument}
            disabled={
              !documentPreview ||
              (documentPreview.status !== 'SIGNED' && documentPreview.status !== 'EXPORTED') ||
              isDocumentExporting
            }
          >
            {isDocumentExporting ? 'Exportando...' : 'Exportar'}
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
