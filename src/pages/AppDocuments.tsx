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

import {
  documentsExportHtml,
  documentsGet,
  documentsList,
  documentsSign,
  type DocumentDetail,
  type DocumentStatus,
  type DocumentSummary
} from '../api/documents';
import { getErrorMessage } from '../api/errors';
import { lawyersCreate, lawyersList, type LawyerPayload, type LawyerSummary } from '../api/lawyers';
import { officeGet, type OfficeProfile } from '../api/office';
import { useAuth } from '../state/auth';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

type ToastState = {
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
} | null;

type SignatureFormState = {
  lawyerId: string;
};

type LawyerFormState = {
  name: string;
  oab: string;
  oabUf: string;
  email: string;
  phone: string;
  address: string;
};

const AppDocuments = () => {
  const { sessionId } = useAuth();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [lawyers, setLawyers] = useState<LawyerSummary[]>([]);
  const [officeProfile, setOfficeProfile] = useState<OfficeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLawyersLoading, setIsLawyersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [signatureForm, setSignatureForm] = useState<SignatureFormState>({
    lawyerId: ''
  });
  const [lawyerForm, setLawyerForm] = useState<LawyerFormState>({
    name: '',
    oab: '',
    oabUf: '',
    email: '',
    phone: '',
    address: ''
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLawyerDialogOpen, setIsLawyerDialogOpen] = useState(false);

  const defaultLawyerId = useMemo(
    () => officeProfile?.defaultLawyerId ?? lawyers[0]?.id ?? '',
    [officeProfile?.defaultLawyerId, lawyers]
  );

  const loadDocuments = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await documentsList(sessionId);
      setDocuments(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar documentos.'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadLawyers = async () => {
    if (!sessionId) return;
    setIsLawyersLoading(true);
    try {
      const data = await lawyersList(sessionId);
      setLawyers(data);
    } catch (err) {
      setToast({ message: getErrorMessage(err, 'Falha ao carregar advogados.'), severity: 'error' });
    } finally {
      setIsLawyersLoading(false);
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

  useEffect(() => {
    void loadDocuments();
    void loadLawyers();
    void loadOfficeProfile();
  }, [sessionId]);

  const openDocument = async (documentId: string) => {
    if (!sessionId) return;
    setError(null);
    try {
      const detail = await documentsGet(sessionId, documentId);
      setSelectedDocument(detail);
      setSignatureForm({
        lawyerId: detail.signedByLawyerId ?? defaultLawyerId
      });
      setIsDialogOpen(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar documento.'));
    }
  };

  const handleSign = async () => {
    if (!sessionId || !selectedDocument) return;
    if (!signatureForm.lawyerId) {
      setToast({ message: 'Selecione o advogado responsável.', severity: 'error' });
      return;
    }
    setIsSigning(true);
    try {
      const response = await documentsSign(sessionId, selectedDocument.id, signatureForm.lawyerId);
      setSelectedDocument((prev) =>
        prev
          ? {
              ...prev,
              htmlPreview: response.htmlPreview,
              contentSha256: response.contentSha256,
              status: response.status as DocumentStatus,
              signedByLawyerId: response.signedByLawyerId,
              signedByLabel: response.signedByLabel,
              signedAt: response.signedAt
            }
          : prev
      );
      setToast({ message: 'Documento assinado com sucesso.', severity: 'success' });
      await loadDocuments();
    } catch (err) {
      setToast({ message: 'Falha ao assinar documento.', severity: 'error' });
    } finally {
      setIsSigning(false);
    }
  };

  const handleExport = async () => {
    if (!sessionId || !selectedDocument) return;
    setIsExporting(true);
    try {
      const response = await documentsExportHtml(sessionId, selectedDocument.id);
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
      setIsExporting(false);
    }
  };

  const openLawyerDialog = () => {
    setLawyerForm({
      name: '',
      oab: '',
      oabUf: '',
      email: '',
      phone: '',
      address: ''
    });
    setIsLawyerDialogOpen(true);
  };

  const handleCreateLawyer = async () => {
    if (!sessionId) return;
    if (!lawyerForm.name.trim() || !lawyerForm.oab.trim() || !lawyerForm.oabUf.trim()) {
      setToast({ message: 'Informe nome, OAB e UF.', severity: 'error' });
      return;
    }
    const payload: LawyerPayload = {
      name: lawyerForm.name.trim(),
      oab: lawyerForm.oab.trim(),
      oabUf: lawyerForm.oabUf.trim(),
      email: lawyerForm.email.trim() || undefined,
      phone: lawyerForm.phone.trim() || undefined,
      address: lawyerForm.address.trim() || undefined
    };
    try {
      const created = await lawyersCreate(sessionId, payload);
      await loadLawyers();
      setSignatureForm((prev) => ({ ...prev, lawyerId: created.id }));
      setToast({ message: 'Advogado criado com sucesso.', severity: 'success' });
      setIsLawyerDialogOpen(false);
    } catch (err) {
      setToast({ message: 'Falha ao criar advogado.', severity: 'error' });
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            Documentos
          </Typography>
          <Button variant="outlined" onClick={openLawyerDialog}>
            Novo advogado
          </Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
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
            {documents.map((document) => (
              <TableRow key={document.id} hover>
                <TableCell>{document.title}</TableCell>
                <TableCell>{document.documentType}</TableCell>
                <TableCell>{document.status}</TableCell>
                <TableCell>{formatDateTime(document.updatedAt)}</TableCell>
                <TableCell align="right">
                  <Button size="small" variant="outlined" onClick={() => openDocument(document.id)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Nenhum documento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Documento</DialogTitle>
        <DialogContent>
          {selectedDocument && (
            <Stack spacing={2} mt={1}>
              <Typography variant="body2">Status: {selectedDocument.status}</Typography>
              {selectedDocument.signedByLabel && (
                <Typography variant="body2">{selectedDocument.signedByLabel}</Typography>
              )}
              {selectedDocument.signedAt && (
                <Typography variant="body2">Data: {selectedDocument.signedAt}</Typography>
              )}
              {selectedDocument.contentSha256 && (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  Hash SHA-256: {selectedDocument.contentSha256}
                </Typography>
              )}
              <FormControl fullWidth>
                <InputLabel>Advogado responsável</InputLabel>
                <Select
                  label="Advogado responsável"
                  value={signatureForm.lawyerId}
                  onChange={(event) =>
                    setSignatureForm((prev) => ({ ...prev, lawyerId: event.target.value }))
                  }
                  disabled={isLawyersLoading}
                >
                  {lawyers.map((lawyer) => (
                    <MenuItem key={lawyer.id} value={lawyer.id}>
                      {lawyer.name} · OAB/{lawyer.oabUf} {lawyer.oab}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <iframe
                  title="Pré-visualização do documento"
                  srcDoc={selectedDocument.htmlPreview}
                  style={{ width: '100%', height: 360, border: 'none' }}
                />
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)}>Fechar</Button>
          <Button
            variant="outlined"
            onClick={handleSign}
            disabled={
              !selectedDocument ||
              selectedDocument.status !== 'DRAFT' ||
              isSigning ||
              !signatureForm.lawyerId
            }
          >
            {isSigning ? 'Assinando...' : 'Gerar assinatura'}
          </Button>
          <Button
            variant="contained"
            onClick={handleExport}
            disabled={
              !selectedDocument ||
              selectedDocument.status !== 'SIGNED' ||
              isExporting
            }
          >
            {isExporting ? 'Exportando...' : 'Exportar HTML'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isLawyerDialogOpen}
        onClose={() => setIsLawyerDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Novo advogado</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nome"
              value={lawyerForm.name}
              onChange={(event) => setLawyerForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="OAB"
                value={lawyerForm.oab}
                onChange={(event) => setLawyerForm((prev) => ({ ...prev, oab: event.target.value }))}
                fullWidth
              />
              <TextField
                label="UF"
                value={lawyerForm.oabUf}
                onChange={(event) => setLawyerForm((prev) => ({ ...prev, oabUf: event.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="E-mail"
              value={lawyerForm.email}
              onChange={(event) => setLawyerForm((prev) => ({ ...prev, email: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Telefone"
              value={lawyerForm.phone}
              onChange={(event) => setLawyerForm((prev) => ({ ...prev, phone: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Endereço"
              value={lawyerForm.address}
              onChange={(event) => setLawyerForm((prev) => ({ ...prev, address: event.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsLawyerDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateLawyer}>
            Salvar
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

export default AppDocuments;
