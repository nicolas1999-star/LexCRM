import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { clientsGet, type ClientDetail } from '../api/clients';
import { getErrorMessage } from '../api/errors';
import { useAuth } from '../state/auth';
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
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { clientsGet, type ClientDetail } from '../api/clients';
import {
  casesCreate,
  casesGet,
  casesList,
  casesUpdate,
  type CaseIdentifierType,
  type CaseSummary
} from '../api/cases';
import {
  attendancesCreate,
  attendancesDelete,
  attendancesList,
  attendancesUpdate,
  type AttendanceChannel,
  type AttendancePayload,
  type AttendanceSummary
} from '../api/attendances';
import { clientsGet, type ClientDetail, type ClientStatus, type ClientType } from '../api/clients';
import { getErrorMessage } from '../api/errors';

type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type CaseFormState = {
  id?: string;
  identifierType: CaseIdentifierType | '';
  identifier: string;
  courtCity: string;
  courtUnit: string;
  panel: string;
  rapporteur: string;
  distributedAt: string;
  closedAt: string;
  area: string;
  phase: string;
  valueAmount: string;
  documentsPath: string;
};

const identifierTypeOptions: CaseIdentifierType[] = ['CNJ', 'ADM', 'OUTRO'];

const emptyCaseForm = (): CaseFormState => ({
  identifierType: '',
  identifier: '',
  courtCity: '',
  courtUnit: '',
  panel: '',
  rapporteur: '',
  distributedAt: '',
  closedAt: '',
  area: '',
  phase: '',
  valueAmount: '',
  documentsPath: ''
});

const ClientDetailPage = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { sessionId } = useAuth();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [tab, setTab] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [caseForm, setCaseForm] = useState<CaseFormState>(emptyCaseForm());

  const canFetch = useMemo(() => !!sessionId && !!clientId, [sessionId, clientId]);

  const loadClient = async () => {
    if (!sessionId || !clientId) return;
    try {
      const detail = await clientsGet(sessionId, clientId);
      setClient(detail);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar cliente.'));
    }
  };

  const loadCases = async () => {
    if (!sessionId || !clientId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await casesList(sessionId, clientId);
      setCases(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar processos.'));
    } finally {
      setIsLoading(false);
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
  PRESENCIAL: 'Presencial',
  WHATSAPP: 'WhatsApp',
  TELEFONE: 'Telefone',
  EMAIL: 'Email',
  VIDEO: 'Vídeo'
};

const typeLabels: Record<ClientType, string> = {
  PF: 'Pessoa Física',
  PJ: 'Pessoa Jurídica'
};

const statusLabels: Record<ClientStatus, string> = {
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado'
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
  const { sessionId } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canFetch = useMemo(() => !!sessionId && !!id, [sessionId, id]);

  useEffect(() => {
    const loadClient = async () => {
      if (!sessionId || !id) return;
      setError(null);
      try {
        const data = await clientsGet(sessionId, id);
        setClient(data);
      } catch (err) {
        setError(getErrorMessage(err, 'Falha ao carregar cliente.'));
      }
    };
    if (canFetch) {
      void loadClient();
    }
  }, [canFetch, id, sessionId]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Detalhes do cliente
      </Typography>
      {error && (
        <Box mb={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      {client ? (
        <Box>
          <Typography variant="subtitle1">{client.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            CPF/CNPJ: {client.cpfCnpj}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Email: {client.email ?? '-'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Telefone: {client.phone ?? '-'}
          </Typography>
        </Box>
      ) : (
        !error && (
          <Typography variant="body2" color="text.secondary">
            Nenhum cliente selecionado.
          </Typography>
        )
      )}
  const navigate = useNavigate();
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
      setClientError(getErrorMessage(err, 'Falha ao carregar cliente.'));
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
      setAttendanceError(getErrorMessage(err, 'Falha ao carregar atendimentos.'));
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) {
      void loadClient();
      void loadCases();
    }
  }, [canFetch]);

  const handleToastClose = () => setToast(null);

  const openCreateForm = () => {
    setFormMode('create');
    setCaseForm(emptyCaseForm());
    setIsFormOpen(true);
  };

  const openEditForm = async (caseItem: CaseSummary) => {
    if (!sessionId) return;
    setFormMode('edit');
    try {
      const detail = await casesGet(sessionId, caseItem.id);
      setCaseForm({
        id: detail.id,
        identifierType: detail.identifierType,
        identifier: detail.identifier,
        courtCity: detail.courtCity ?? '',
        courtUnit: detail.courtUnit ?? '',
        panel: detail.panel ?? '',
        rapporteur: detail.rapporteur ?? '',
        distributedAt: detail.distributedAt ?? '',
        closedAt: detail.closedAt ?? '',
        area: detail.area ?? '',
        phase: detail.phase ?? '',
        valueAmount: detail.valueAmount != null ? String(detail.valueAmount) : '',
        documentsPath: detail.documentsPath ?? ''
      });
      setIsFormOpen(true);
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao carregar processo.'), severity: 'error' });
    }
  };

  const sanitizeOptional = (value: string) => value.trim() || undefined;

  const handleFormSubmit = async () => {
    if (!sessionId || !clientId) return;
    const identifierType = caseForm.identifierType;
    const identifier = caseForm.identifier.trim();
    if (!identifierType) {
      setToast({ message: 'Selecione o tipo do identificador.', severity: 'error' });
      return;
    }
    if (!identifier) {
      setToast({ message: 'Informe o identificador.', severity: 'error' });
      return;
    }
    const valueAmountRaw = caseForm.valueAmount.trim();
    let valueAmount: number | undefined;
    if (valueAmountRaw) {
      const normalizedValue = Number(valueAmountRaw.replace(',', '.'));
      if (Number.isNaN(normalizedValue)) {
        setToast({ message: 'Informe um valor válido.', severity: 'error' });
        return;
      }
      valueAmount = normalizedValue;
    }

    const payload = {
      identifierType,
      identifier,
      courtCity: sanitizeOptional(caseForm.courtCity),
      courtUnit: sanitizeOptional(caseForm.courtUnit),
      panel: sanitizeOptional(caseForm.panel),
      rapporteur: sanitizeOptional(caseForm.rapporteur),
      distributedAt: sanitizeOptional(caseForm.distributedAt),
      closedAt: sanitizeOptional(caseForm.closedAt),
      area: sanitizeOptional(caseForm.area),
      phase: sanitizeOptional(caseForm.phase),
      valueAmount,
      documentsPath: sanitizeOptional(caseForm.documentsPath)
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
      setToast({ message: 'Informe a data/hora do atendimento.', severity: 'error' });
      return;
    }
    if (!attendanceForm.channel) {
      setToast({ message: 'Selecione o canal do atendimento.', severity: 'error' });
      return;
    }
    if (!attendanceForm.subject.trim()) {
      setToast({ message: 'Informe o assunto do atendimento.', severity: 'error' });
      return;
    }
    if (!attendanceForm.notes.trim()) {
      setToast({ message: 'Informe as notas do atendimento.', severity: 'error' });
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
        await casesCreate(sessionId, { clientId, ...payload });
        setToast({ message: 'Processo criado.', severity: 'success' });
      } else if (caseForm.id) {
        await casesUpdate(sessionId, caseForm.id, payload);
        setToast({ message: 'Processo atualizado.', severity: 'success' });
      }
      setIsFormOpen(false);
      await loadCases();
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Falha ao salvar processo.'),
        severity: 'error'
      });
        await attendancesCreate(sessionId, id, payload);
        setToast({ message: 'Atendimento criado.', severity: 'success' });
      } else if (attendanceForm.id) {
        await attendancesUpdate(sessionId, attendanceForm.id, payload);
        setToast({ message: 'Atendimento atualizado.', severity: 'success' });
      }
      setIsFormOpen(false);
      await loadAttendances();
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao salvar atendimento.'), severity: 'error' });
    }
  };

  const handleDeleteAttendance = async () => {
    if (!sessionId || !deleteTarget) return;
    try {
      await attendancesDelete(sessionId, deleteTarget.id);
      setToast({ message: 'Atendimento removido.', severity: 'success' });
      setDeleteTarget(null);
      await loadAttendances();
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao remover atendimento.'), severity: 'error' });
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            {client ? `Cliente: ${client.name}` : 'Detalhe do cliente'}
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/admin/clients')}>
            Voltar
          </Button>
        </Stack>

        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Resumo" />
          <Tab label="Processos" />
        </Tabs>

        {error && <Alert severity="error">{error}</Alert>}

        {tab === 0 && (
          <Stack spacing={1}>
            {client ? (
              <>
                <Typography>Tipo: {client.type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</Typography>
                <Typography>CPF/CNPJ: {client.cpfCnpj}</Typography>
                {client.email && <Typography>Email: {client.email}</Typography>}
                {client.phone && <Typography>Telefone: {client.phone}</Typography>}
                {client.notes && <Typography>Observações: {client.notes}</Typography>}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Carregando informações do cliente...
              </Typography>
            )}
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Processos
              </Typography>
              <Button variant="contained" onClick={openCreateForm} disabled={!clientId}>
                Novo processo
              </Button>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Identificador</TableCell>
                  <TableCell>Comarca</TableCell>
                  <TableCell>Vara/Juízo</TableCell>
                  <TableCell>Fase</TableCell>
                  <TableCell>Valor</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cases.map((caseItem) => (
                  <TableRow key={caseItem.id} hover>
                    <TableCell>{caseItem.identifierType}</TableCell>
                    <TableCell>{caseItem.identifier}</TableCell>
                    <TableCell>{caseItem.courtCity || '-'}</TableCell>
                    <TableCell>{caseItem.courtUnit || '-'}</TableCell>
                    <TableCell>{caseItem.phase || '-'}</TableCell>
                    <TableCell>
                      {caseItem.valueAmount != null ? caseItem.valueAmount.toLocaleString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" onClick={() => openEditForm(caseItem)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && cases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      Nenhum processo encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Stack>
        )}
      </Stack>

      <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{formMode === 'create' ? 'Novo processo' : 'Editar processo'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <FormControl fullWidth>
              <InputLabel>Tipo de identificador</InputLabel>
              <Select
                label="Tipo de identificador"
                value={caseForm.identifierType}
                onChange={(event) =>
                  setCaseForm((prev) => ({
                    ...prev,
                    identifierType: event.target.value as CaseIdentifierType
                  }))
                }
              >
                {identifierTypeOptions.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4">Detalhe do cliente</Typography>
            <Typography variant="body2" color="text.secondary">
              {client ? `${client.name} · ${formatCpfCnpj(client.cpfCnpj)}` : 'Carregando dados'}
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => navigate('/admin/clients')}>
            Voltar para clientes
          </Button>
        </Stack>

        {clientError && <Alert severity="error">{clientError}</Alert>}

        <Paper variant="outlined">
          <Tabs value={tabIndex} onChange={(_, value) => setTabIndex(value)}>
            <Tab label="Dados" />
            <Tab label="Atendimentos" />
          </Tabs>
          <Divider />
          <Box sx={{ p: 3 }}>
            {tabIndex === 0 && (
              <Stack spacing={2}>
                {isClientLoading && <Typography>Carregando dados do cliente...</Typography>}
                {client && (
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Tipo
                        </Typography>
                        <Typography>{typeLabels[client.type]}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Status
                        </Typography>
                        <Typography>{statusLabels[client.status]}</Typography>
                      </Paper>
                    </Stack>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Email
                        </Typography>
                        <Typography>{client.email || 'Não informado'}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Telefone
                        </Typography>
                        <Typography>{client.phone || 'Não informado'}</Typography>
                      </Paper>
                    </Stack>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Observações
                      </Typography>
                      <Typography>{client.notes || 'Sem observações.'}</Typography>
                    </Paper>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Criado em
                        </Typography>
                        <Typography>{formatDateTime(client.createdAt)}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Última atualização
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
                    Atendimentos
                  </Typography>
                  <Button variant="contained" onClick={openCreateForm}>
                    Novo atendimento
                  </Button>
                </Stack>

                {attendanceError && <Alert severity="error">{attendanceError}</Alert>}

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Data/hora</TableCell>
                      <TableCell>Canal</TableCell>
                      <TableCell>Assunto</TableCell>
                      <TableCell>Notas</TableCell>
                      <TableCell align="right">Ações</TableCell>
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
                              Editar
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => setDeleteTarget(attendance)}
                            >
                              Remover
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isAttendanceLoading && attendances.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          Nenhum atendimento registrado.
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
          {formMode === 'create' ? 'Novo atendimento' : 'Editar atendimento'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Data/hora"
              type="datetime-local"
              value={attendanceForm.occurredAt}
              onChange={(event) =>
                setAttendanceForm((prev) => ({ ...prev, occurredAt: event.target.value }))
              }
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Canal</InputLabel>
              <Select
                label="Canal"
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
              label="Identificador"
              value={caseForm.identifier}
              onChange={(event) =>
                setCaseForm((prev) => ({ ...prev, identifier: event.target.value }))
              }
              fullWidth
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Comarca"
                value={caseForm.courtCity}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, courtCity: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Vara/Juízo"
                value={caseForm.courtUnit}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, courtUnit: event.target.value }))
                }
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Câmara/Turma"
                value={caseForm.panel}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, panel: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Relator(a)"
                value={caseForm.rapporteur}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, rapporteur: event.target.value }))
                }
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Distribuído em"
                type="date"
                value={caseForm.distributedAt}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, distributedAt: event.target.value }))
                }
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Encerrado em"
                type="date"
                value={caseForm.closedAt}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, closedAt: event.target.value }))
                }
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Área"
                value={caseForm.area}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, area: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Fase"
                value={caseForm.phase}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, phase: event.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Valor"
                type="number"
                value={caseForm.valueAmount}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, valueAmount: event.target.value }))
                }
                fullWidth
                inputProps={{ step: '0.01' }}
              />
              <TextField
                label="Pasta de documentos"
                value={caseForm.documentsPath}
                onChange={(event) =>
                  setCaseForm((prev) => ({ ...prev, documentsPath: event.target.value }))
                }
                fullWidth
              />
            </Stack>
              label="Assunto"
              value={attendanceForm.subject}
              onChange={(event) =>
                setAttendanceForm((prev) => ({ ...prev, subject: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Notas"
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
          <Button onClick={() => setIsFormOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleFormSubmit}>
          <Button variant="contained" onClick={handleSaveAttendance}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={handleToastClose}>
        <Alert onClose={handleToastClose} severity={toast?.severity ?? 'info'} variant="filled">
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Remover atendimento</DialogTitle>
        <DialogContent>
          <Typography>Tem certeza que deseja remover este atendimento?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDeleteAttendance}>
            Remover
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
