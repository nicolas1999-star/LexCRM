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
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

import { attendancesCreate, attendancesDelete, attendancesList, attendancesUpdate } from '../api/attendances';
import type {
  AttendanceChannel,
  AttendancePayload,
  AttendanceSummary
} from '../api/attendances';
import { clientsList, type ClientSummary } from '../api/clients';
import {
  documentsCreateDraft,
  documentsExportHtml,
  documentsGenerateHtml,
  documentsGet,
  documentsList,
  documentsSign
} from '../api/documents';
import type {
  DocumentDetail,
  DocumentGeneratePayload,
  DocumentStatus,
  DocumentSummary,
  DocumentType
} from '../api/documents';
import { getErrorMessage } from '../api/errors';
import { lawyersList, type LawyerSummary } from '../api/lawyers';
import { officeGet, type OfficeProfile } from '../api/office';
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
  lawyerId: string;
  title: string;
  history: string;
  analysis: string;
  conclusion: string;
};

type DocumentPreviewState = {
  documentId?: string;
  html: string;
  status: DocumentStatus | 'PREVIEW';
  contentSha256?: string | null;
  signedByLabel?: string | null;
  signedAt?: string | null;
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
  const [lawyers, setLawyers] = useState<LawyerSummary[]>([]);
  const [officeProfile, setOfficeProfile] = useState<OfficeProfile | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<DocumentSummary[]>([]);
  const [isClientsLoading, setIsClientsLoading] = useState(false);
  const [isAttendancesLoading, setIsAttendancesLoading] = useState(false);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
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

  const loadLawyers = async () => {
    if (!sessionId) return;
    try {
      const data = await lawyersList(sessionId);
      setLawyers(data);
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao carregar advogados.'), severity: 'error' });
    }
  };

  const loadOfficeProfile = async () => {
    if (!sessionId) return;
    try {
      const profile = await officeGet(sessionId);
      setOfficeProfile(profile);
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao carregar perfil do escritório.'), severity: 'error' });
    }
  };

  const loadRecentDocuments = async () => {
    if (!sessionId) return;
    setIsDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const data = await documentsList(sessionId);
      setRecentDocuments(data.slice(0, 5));
    } catch (err) {
      setDocumentsError(getErrorMessage(err, 'Falha ao carregar documentos recentes.'));
    } finally {
      setIsDocumentsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadClients();
      void loadLawyers();
      void loadOfficeProfile();
      void loadRecentDocuments();
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
    const defaultLawyerId = officeProfile?.defaultLawyerId ?? lawyers[0]?.id ?? '';
    setDocumentForm({
      attendanceId: attendance.id,
      attendanceDate: formatDateTime(attendance.occurredAt),
      documentType: 'RELATORIO',
      officeName: officeProfile?.officeName ?? '',
      lawyerId: defaultLawyerId,
      title: attendance.subject,
      history: attendance.notes,
      analysis: '',
      conclusion: ''
    });
    setDocumentPreview(null);
    setIsDocumentDialogOpen(true);
  };

  const buildDocumentPayload = (): DocumentGeneratePayload | null => {
    if (!documentForm || !selectedClient) return null;
    const officeName = documentForm.officeName.trim();
    return {
      documentType: documentForm.documentType,
      officeName: officeName.length > 0 ? officeName : undefined,
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
    };
  };

  const applyDocumentDetail = (detail: DocumentDetail) => {
    setDocumentPreview({
      documentId: detail.id,
      html: detail.htmlPreview,
      status: detail.status,
      contentSha256: detail.contentSha256,
      signedByLabel: detail.signedByLabel,
      signedAt: detail.signedAt
    });
  };

  const handleGenerateDocument = async () => {
    if (!sessionId || !documentForm || !selectedClient) return;
    const hasOfficeName = documentForm.officeName.trim().length > 0;
    const hasOfficeProfileName = officeProfile?.officeName?.trim().length;
    if (!hasOfficeName && !hasOfficeProfileName) {
      setToast({ message: 'Informe o nome do escritório.', severity: 'error' });
      return;
    }
    if (!documentForm.title.trim()) {
      setToast({ message: 'Informe o título do documento.', severity: 'error' });
      return;
    }
    const payload = buildDocumentPayload();
    if (!payload) return;
    setIsDocumentGenerating(true);
    try {
      const response = await documentsGenerateHtml(sessionId, payload);
      setDocumentPreview({
        html: response.html,
        status: 'PREVIEW'
      });
      setToast({ message: 'Preview gerado com sucesso.', severity: 'success' });
    } catch (err) {
      setToast({ message: getErrorMessage(err, t('appointments.toast.generateError')), severity: 'error' });
    } finally {
      setIsDocumentGenerating(false);
    }
  };

  const handleCopyDocumentHash = () => {
    if (!documentPreview?.contentSha256) return;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(documentPreview.contentSha256);
      setToast({ message: 'Hash copiado para a área de transferência.', severity: 'success' });
    } else {
      setToast({ message: 'Não foi possível copiar o hash.', severity: 'warning' });
    }
  };

  const handleSaveDraft = async () => {
    if (!sessionId || !documentForm || !documentPreview || !selectedClient) return;
    if (documentPreview.status !== 'PREVIEW') {
      setToast({ message: 'Gere o preview antes de salvar o rascunho.', severity: 'warning' });
      return;
    }
    const payload = buildDocumentPayload();
    if (!payload) return;
    setIsDocumentGenerating(true);
    try {
      const response = await documentsCreateDraft(sessionId, {
        payloadJson: JSON.stringify(payload),
        htmlPreview: documentPreview.html,
        title: payload.title,
        clientId: payload.clientId
      });
      applyDocumentDetail(response);
      setToast({ message: 'Documento salvo como rascunho.', severity: 'success' });
      await loadRecentDocuments();
    } catch (err) {
      setToast({ message: 'Falha ao salvar rascunho.', severity: 'error' });
    } finally {
      setIsDocumentGenerating(false);
    }
  };

  const handleSignDocument = async () => {
    if (!sessionId || !documentPreview || !documentForm) return;
    if (!documentPreview.documentId) {
      setToast({ message: 'Salve o rascunho antes de assinar.', severity: 'warning' });
      return;
    }
    if (!documentForm.lawyerId) {
      setToast({ message: 'Selecione o advogado responsável.', severity: 'error' });
      return;
    }
    setIsDocumentSigning(true);
    try {
      const response = await documentsSign(
        sessionId,
        documentPreview.documentId,
        documentForm.lawyerId
      );
      applyDocumentDetail(response);
      setToast({ message: 'Documento assinado com sucesso.', severity: 'success' });
      await loadRecentDocuments();
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
      if (!documentPreview.documentId) {
        setToast({ message: 'Salve e assine o documento antes de exportar.', severity: 'warning' });
        return;
      }
      if (documentPreview.status !== 'SIGNED') {
        setToast({ message: 'Documento precisa estar assinado para exportar.', severity: 'warning' });
        return;
      }
      const response = await documentsExportHtml(sessionId, documentPreview.documentId);
      const targetPath = await save({
        defaultPath: response.filename,
        filters: [{ name: 'HTML', extensions: ['html'] }]
      });
      if (!targetPath) {
        setToast({ message: 'Exportação cancelada.', severity: 'info' });
        return;
      }
      await writeTextFile(targetPath, response.html);
      setToast({ message: 'Documento exportado com sucesso.', severity: 'success' });
    } catch (err) {
      setToast({ message: 'Falha ao exportar documento.', severity: 'error' });
    } finally {
      setIsDocumentExporting(false);
    }
  };

  const handleOpenRecentDocument = async (documentId: string) => {
    if (!sessionId) return;
    try {
      const detail = await documentsGet(sessionId, documentId);
      let payload: DocumentGeneratePayload | null = null;
      try {
        payload = JSON.parse(detail.payloadJson) as DocumentGeneratePayload;
      } catch (error) {
        payload = null;
      }
      if (payload) {
        setDocumentForm({
          attendanceId: payload.appointmentId ?? '',
          attendanceDate: payload.attendanceDate,
          documentType: payload.documentType,
          officeName: payload.officeName ?? officeProfile?.officeName ?? '',
          lawyerId: detail.signedByLawyerId ?? officeProfile?.defaultLawyerId ?? '',
          title: payload.title,
          history: payload.history,
          analysis: payload.analysis,
          conclusion: payload.conclusion
        });
      } else {
        setDocumentForm({
          attendanceId: '',
          attendanceDate: '',
          documentType: detail.documentType,
          officeName: officeProfile?.officeName ?? '',
          lawyerId: detail.signedByLawyerId ?? officeProfile?.defaultLawyerId ?? '',
          title: detail.title,
          history: '',
          analysis: '',
          conclusion: ''
        });
      }
      applyDocumentDetail(detail);
      setIsDocumentDialogOpen(true);
    } catch (err) {
      setToast({ message: 'Falha ao carregar documento.', severity: 'error' });
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

  const isPreviewReady = documentPreview?.status === 'PREVIEW';
  const isDraftReady = documentPreview?.status === 'DRAFT';
  const isSigned = documentPreview?.status === 'SIGNED';
  const isSaveDraftDisabled = !documentPreview || !isPreviewReady || isDocumentGenerating;
  const isSignDisabled =
    !documentPreview || !isDraftReady || isDocumentSigning || !documentForm?.lawyerId;
  const isExportDisabled = !documentPreview || !isSigned || isDocumentExporting;

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

        <Stack spacing={1}>
          <Typography variant="h6">Documentos recentes</Typography>
          {documentsError && <Alert severity="error">{documentsError}</Alert>}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Título</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Atualizado em</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentDocuments.map((document) => (
                <TableRow key={document.id} hover>
                  <TableCell>{document.title}</TableCell>
                  <TableCell>{document.documentType}</TableCell>
                  <TableCell>{document.status}</TableCell>
                  <TableCell>{formatDateTime(document.updatedAt)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" onClick={() => handleOpenRecentDocument(document.id)}>
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isDocumentsLoading && recentDocuments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    Nenhum documento recente.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Stack>
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
              <FormControl fullWidth>
                <InputLabel>Advogado responsável</InputLabel>
                <Select
                  label="Advogado responsável"
                  value={documentForm.lawyerId}
                  onChange={(event) =>
                    setDocumentForm((prev) =>
                      prev ? { ...prev, lawyerId: event.target.value } : prev
                    )
                  }
                >
                  {lawyers.map((lawyer) => (
                    <MenuItem key={lawyer.id} value={lawyer.id}>
                      {lawyer.name} · OAB/{lawyer.oabUf} {lawyer.oab}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {lawyers.length === 0 && (
                <Alert severity="warning">Cadastre um advogado para assinatura.</Alert>
              )}
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
                {documentPreview.signedByLabel && (
                  <Typography variant="body2">{documentPreview.signedByLabel}</Typography>
                )}
                {documentPreview.signedAt && (
                  <Typography variant="body2">Data: {documentPreview.signedAt}</Typography>
                )}
                {documentPreview.contentSha256 && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">Hash SHA-256 do conteúdo:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {documentPreview.contentSha256}
                    </Typography>
                    <Button size="small" onClick={handleCopyDocumentHash}>
                      Copiar
                    </Button>
                  </Stack>
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
            {isDocumentGenerating ? 'Gerando...' : 'Gerar preview'}
          </Button>
          <Button variant="outlined" onClick={handleSaveDraft} disabled={isSaveDraftDisabled}>
            Salvar rascunho
          </Button>
          <Button
            variant="outlined"
            onClick={handleSignDocument}
            disabled={isSignDisabled}
          >
            {isDocumentSigning ? 'Assinando...' : 'Gerar assinatura'}
          </Button>
          <Button
            variant="contained"
            onClick={handleExportDocument}
            disabled={isExportDisabled}
          >
            {isDocumentExporting ? 'Exportando...' : 'Exportar HTML'}
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
