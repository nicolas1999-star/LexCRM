import { invoke } from '@tauri-apps/api/tauri';

export type DocumentType = 'RELATORIO' | 'PARECER';

export type DocumentGeneratePayload = {
  documentType: DocumentType;
  officeName: string;
  generatedAt: string;
  clientId: string;
  clientName: string;
  clientDocument: string;
  clientEmail?: string;
  clientPhone?: string;
  title: string;
  attendanceDate: string;
  history: string;
  analysis: string;
  conclusion: string;
  appointmentId?: string;
};

export type DocumentHtmlResponse = {
  html: string;
  documentId: string;
  documentHash: string;
  contentHash: string;
  createdAt: string;
  authoredByName: string;
  authoredByOab?: string | null;
};

export type DocumentExportHtmlPayload = {
  filePath: string;
  documentId: string;
  documentType?: DocumentType;
  appointmentId?: string;
};

export type DocumentExportHtmlResponse = {
  filePath: string;
};

export type DocumentLogExportPayload = {
  documentId: string;
  documentType?: DocumentType;
  appointmentId?: string;
  format: string;
};

export const documentsGenerateHtml = async (
  sessionId: string,
  payload: DocumentGeneratePayload
): Promise<DocumentHtmlResponse> => {
  return invoke('documents_generate_html', {
    sessionId,
    payload: {
      documentType: payload.documentType,
      officeName: payload.officeName,
      generatedAt: payload.generatedAt,
      clientId: payload.clientId,
      clientName: payload.clientName,
      clientDocument: payload.clientDocument,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      title: payload.title,
      attendanceDate: payload.attendanceDate,
      history: payload.history,
      analysis: payload.analysis,
      conclusion: payload.conclusion,
      appointmentId: payload.appointmentId
    }
  });
};

export const documentsExportHtml = async (
  sessionId: string,
  payload: DocumentExportHtmlPayload
): Promise<DocumentExportHtmlResponse> => {
  return invoke('documents_export_html', {
    sessionId,
    payload: {
      filePath: payload.filePath,
      documentId: payload.documentId,
      documentType: payload.documentType,
      appointmentId: payload.appointmentId
    }
  });
};

export const documentsLogExport = async (
  sessionId: string,
  payload: DocumentLogExportPayload
): Promise<void> => {
  return invoke('documents_log_export', {
    sessionId,
    payload: {
      documentId: payload.documentId,
      documentType: payload.documentType,
      appointmentId: payload.appointmentId,
      format: payload.format
    }
  });
};
