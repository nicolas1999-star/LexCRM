import { useEffect, useMemo, useState } from 'react';
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

import {
  documentsExportPdf,
  documentsGet,
  documentsList,
  documentsSign,
  type DocumentDetail,
  type DocumentStatus,
  type DocumentSummary
} from '../api/documents';
import { getErrorMessage } from '../api/errors';
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
  lawyerName: string;
  lawyerOab: string;
};

const AppDocuments = () => {
  const { sessionId, user } = useAuth();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [signatureForm, setSignatureForm] = useState<SignatureFormState>({
    lawyerName: '',
    lawyerOab: ''
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const defaultOab = useMemo(() => {
    if (user?.oabNumber && user?.oabUf) {
      return `${user.oabUf} ${user.oabNumber}`;
    }
    return '';
  }, [user?.oabNumber, user?.oabUf]);

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

  useEffect(() => {
    void loadDocuments();
  }, [sessionId]);

  const openDocument = async (documentId: string) => {
    if (!sessionId) return;
    setError(null);
    try {
      const detail = await documentsGet(sessionId, documentId);
      setSelectedDocument(detail);
      setSignatureForm({
        lawyerName: detail.lawyerName ?? user?.name ?? '',
        lawyerOab: detail.lawyerOab ?? defaultOab
      });
      setIsDialogOpen(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar documento.'));
    }
  };

  const handleSign = async () => {
    if (!sessionId || !selectedDocument) return;
    if (!signatureForm.lawyerName.trim() || !signatureForm.lawyerOab.trim()) {
      setToast({ message: 'Informe o advogado responsável e a OAB.', severity: 'error' });
      return;
    }
    setIsSigning(true);
    try {
      const response = await documentsSign(
        sessionId,
        selectedDocument.id,
        signatureForm.lawyerName.trim(),
        signatureForm.lawyerOab.trim()
      );
      setSelectedDocument((prev) =>
        prev
          ? {
              ...prev,
              contentHtml: response.htmlSigned,
              hashHtml: response.hashHtml,
              status: response.status as DocumentStatus,
              lawyerName: signatureForm.lawyerName.trim(),
              lawyerOab: signatureForm.lawyerOab.trim()
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
      const response = await documentsExportPdf(sessionId, selectedDocument.id);
      setSelectedDocument((prev) =>
        prev
          ? {
              ...prev,
              filePath: response.filePath,
              hashPdf: response.hashPdf,
              status: response.status as DocumentStatus
            }
          : prev
      );
      setToast({ message: 'Documento exportado com sucesso.', severity: 'success' });
      await loadDocuments();
    } catch (err) {
      setToast({ message: 'Falha ao exportar documento.', severity: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Typography variant="h4">Documentos</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Título</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Criado em</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id} hover>
                <TableCell>{document.title}</TableCell>
                <TableCell>{document.documentType}</TableCell>
                <TableCell>{document.status}</TableCell>
                <TableCell>{formatDateTime(document.createdAt)}</TableCell>
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
              {selectedDocument.hashHtml && (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  Hash HTML: {selectedDocument.hashHtml}
                </Typography>
              )}
              {selectedDocument.hashPdf && (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  Hash PDF: {selectedDocument.hashPdf}
                </Typography>
              )}
              {selectedDocument.filePath && (
                <Typography variant="body2">Arquivo: {selectedDocument.filePath}</Typography>
              )}
              <TextField
                label="Advogado responsável"
                value={signatureForm.lawyerName}
                onChange={(event) =>
                  setSignatureForm((prev) => ({ ...prev, lawyerName: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="OAB"
                value={signatureForm.lawyerOab}
                onChange={(event) =>
                  setSignatureForm((prev) => ({ ...prev, lawyerOab: event.target.value }))
                }
                fullWidth
              />
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <iframe
                  title="Pré-visualização do documento"
                  srcDoc={selectedDocument.contentHtml}
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
            disabled={!selectedDocument || selectedDocument.status !== 'DRAFT' || isSigning}
          >
            {isSigning ? 'Assinando...' : 'Assinar'}
          </Button>
          <Button
            variant="contained"
            onClick={handleExport}
            disabled={
              !selectedDocument ||
              (selectedDocument.status !== 'SIGNED' && selectedDocument.status !== 'EXPORTED') ||
              isExporting
            }
          >
            {isExporting ? 'Exportando...' : 'Exportar PDF'}
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
