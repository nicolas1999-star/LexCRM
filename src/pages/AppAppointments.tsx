import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useAuth } from '../state/auth';
import {
  appointmentsCreate,
  appointmentsGet,
  appointmentsList,
  type AppointmentDetail,
  type AppointmentSummary,
  type CreateAppointmentPayload
} from '../api/appointments';
import {
  documentsExportHtml,
  documentsGenerateHtml,
  documentsLogExport,
  type DocumentType
} from '../api/documents';
import { getErrorMessage } from '../api/errors';

type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type AppointmentFormState = CreateAppointmentPayload;

type PreviewState = {
  html: string;
  appointmentId?: string;
  documentType: DocumentType;
  clientName: string;
};

const OFFICE_NAME = 'LexCRM Advocacia';

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

const formatDisplayDate = (value: string) => {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('pt-BR');
};

const getDocumentTitle = (type: DocumentType) =>
  type === 'PARECER' ? 'Parecer' : 'Relatório de atendimento';

const AppAppointments = () => {
  const { sessionId } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<AppointmentFormState>({
    clientName: '',
    clientDocument: '',
    clientEmail: '',
    clientPhone: '',
    title: '',
    attendanceDate: '',
    history: '',
    analysis: '',
    conclusion: ''
  });
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const canFetch = useMemo(() => !!sessionId, [sessionId]);

  const loadAppointments = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await appointmentsList(sessionId);
      setAppointments(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar atendimentos.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadAppointments();
    }
  }, [canFetch]);

  const handleOpenForm = () => {
    setFormState({
      clientName: '',
      clientDocument: '',
      clientEmail: '',
      clientPhone: '',
      title: '',
      attendanceDate: '',
      history: '',
      analysis: '',
      conclusion: ''
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    if (!formState.clientName.trim()) {
      setToast({ message: 'Informe o nome do cliente.', severity: 'warning' });
      return;
    }
    if (!formState.clientDocument.trim()) {
      setToast({ message: 'Informe o CPF/CNPJ.', severity: 'warning' });
      return;
    }
    if (!formState.title.trim()) {
      setToast({ message: 'Informe o assunto.', severity: 'warning' });
      return;
    }
    if (!formState.attendanceDate) {
      setToast({ message: 'Informe a data do atendimento.', severity: 'warning' });
      return;
    }

    setIsLoading(true);
    try {
      await appointmentsCreate(sessionId, {
        ...formState,
        clientDocument: formState.clientDocument
      });
      setToast({ message: 'Atendimento registrado.', severity: 'success' });
      setIsFormOpen(false);
      await loadAppointments();
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao salvar atendimento.'), severity: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const buildDocumentPayload = (detail: AppointmentDetail, documentType: DocumentType) => {
    return {
      documentType,
      officeName: OFFICE_NAME,
      generatedAt: new Date().toLocaleDateString('pt-BR'),
      clientName: detail.clientName,
      clientDocument: formatCpfCnpj(detail.clientDocument),
      clientEmail: detail.clientEmail ?? undefined,
      clientPhone: detail.clientPhone ?? undefined,
      title: detail.title,
      attendanceDate: formatDisplayDate(detail.attendanceDate),
      history: detail.history,
      analysis: detail.analysis,
      conclusion: detail.conclusion,
      appointmentId: detail.id
    };
  };

  const handleGenerate = async (appointmentId: string, documentType: DocumentType) => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const detail = await appointmentsGet(sessionId, appointmentId);
      const payload = buildDocumentPayload(detail, documentType);
      const response = await documentsGenerateHtml(sessionId, payload);
      setPreviewState({
        html: response.html,
        appointmentId: detail.id,
        documentType,
        clientName: detail.clientName
      });
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Falha ao gerar documento.'),
        severity: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewState(null);
  };

  const handleExportPdf = async () => {
    if (!sessionId || !previewState) return;
    const frame = previewFrameRef.current;
    if (!frame?.contentWindow) {
      setToast({ message: 'Visualização indisponível para impressão.', severity: 'warning' });
      return;
    }
    frame.contentWindow.focus();
    frame.contentWindow.print();
    try {
      await documentsLogExport(sessionId, {
        documentType: previewState.documentType,
        appointmentId: previewState.appointmentId,
        format: 'PDF'
      });
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Falha ao registrar exportação.'),
        severity: 'warning'
      });
    }
  };

  const handleExportHtml = async () => {
    if (!sessionId || !previewState) return;
    const defaultName = `${previewState.documentType.toLowerCase()}-${previewState.clientName
      .toLowerCase()
      .replace(/\s+/g, '-')}`;
    const filePath = await save({
      defaultPath: `${defaultName}.html`,
      filters: [{ name: 'Documento HTML', extensions: ['html'] }]
    });
    if (!filePath) return;
    try {
      await documentsExportHtml(sessionId, {
        html: previewState.html,
        filePath,
        documentType: previewState.documentType,
        appointmentId: previewState.appointmentId
      });
      setToast({ message: 'HTML salvo com sucesso.', severity: 'success' });
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao salvar HTML.'), severity: 'error' });
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h4">Atendimentos</Typography>
          <Typography variant="body2" color="text.secondary">
            Gere relatórios e pareceres com layout padronizado e exportação em PDF.
          </Typography>
        </Box>
        <Button variant="contained" onClick={handleOpenForm}>
          Novo atendimento
        </Button>
      </Stack>

      {error && (
        <Box mb={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Cliente</TableCell>
            <TableCell>CPF/CNPJ</TableCell>
            <TableCell>Assunto</TableCell>
            <TableCell>Data</TableCell>
            <TableCell align="right">Ações</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {appointments.map((appointment) => (
            <TableRow key={appointment.id}>
              <TableCell>{appointment.clientName}</TableCell>
              <TableCell>{formatCpfCnpj(appointment.clientDocument)}</TableCell>
              <TableCell>{appointment.title}</TableCell>
              <TableCell>{formatDisplayDate(appointment.attendanceDate)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleGenerate(appointment.id, 'RELATORIO')}
                  >
                    Gerar relatório
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => handleGenerate(appointment.id, 'PARECER')}
                  >
                    Gerar parecer
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {appointments.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center">
                Nenhum atendimento registrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Novo atendimento</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nome do cliente"
              value={formState.clientName}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, clientName: event.target.value }))
              }
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="CPF/CNPJ"
                value={formatCpfCnpj(formState.clientDocument)}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, clientDocument: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Data do atendimento"
                type="date"
                value={formState.attendanceDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, attendanceDate: event.target.value }))
                }
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Email"
                value={formState.clientEmail}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, clientEmail: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Telefone"
                value={formState.clientPhone}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, clientPhone: event.target.value }))
                }
                fullWidth
              />
            </Stack>
            <TextField
              label="Assunto"
              value={formState.title}
              onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Histórico"
              value={formState.history}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, history: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />
            <TextField
              label="Análise"
              value={formState.analysis}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, analysis: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />
            <TextField
              label="Conclusão"
              value={formState.conclusion}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, conclusion: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={isLoading}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!previewState}
        onClose={handleClosePreview}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {previewState
            ? `Prévia - ${getDocumentTitle(previewState.documentType)}`
            : 'Prévia'}
        </DialogTitle>
        <DialogContent>
          {previewState && (
            <Box sx={{ height: '70vh' }}>
              <iframe
                ref={previewFrameRef}
                title="Prévia do documento"
                style={{ width: '100%', height: '100%', border: '1px solid #e0e0e0' }}
                srcDoc={previewState.html}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleExportHtml}>Salvar HTML</Button>
          <Button variant="contained" onClick={handleExportPdf}>
            Exportar PDF
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
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
};

export default AppAppointments;
