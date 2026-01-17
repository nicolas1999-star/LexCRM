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
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFormOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleFormSubmit}>
            Salvar
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

export default ClientDetailPage;
