import { invoke } from '@tauri-apps/api/tauri';

export type DocumentType = 'RELATORIO' | 'PARECER';
export type DocumentStatus = 'DRAFT' | 'SIGNED' | 'EXPORTED';

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

export type DocumentDraftPayload = DocumentGeneratePayload;

export type DocumentDraftResponse = {
  documentId: string;
  html: string;
  status: DocumentStatus;
};

export type DocumentSignResponse = {
  documentId: string;
  htmlSigned: string;
  hashHtml: string;
  status: DocumentStatus;
};

export type DocumentExportPdfResponse = {
  documentId: string;
  filePath: string;
  hashPdf: string;
  status: DocumentStatus;
};

export type DocumentSummary = {
  id: string;
  documentType: DocumentType;
  clientId?: string | null;
  title: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  hashHtml?: string | null;
  hashPdf?: string | null;
};

export type DocumentDetail = {
  id: string;
  documentType: DocumentType;
  clientId?: string | null;
  title: string;
  contentHtml: string;
  hashHtml?: string | null;
  lawyerName?: string | null;
  lawyerOab?: string | null;
  signedAt?: string | null;
  filePath?: string | null;
  hashPdf?: string | null;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
};

export type DocumentsListFilters = {
  documentType?: DocumentType;
  status?: DocumentStatus;
  clientId?: string;
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

export const documentsCreateDraft = async (
  sessionId: string,
  payload: DocumentDraftPayload
): Promise<DocumentDraftResponse> => {
  return invoke('documents_create_draft', {
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

export const documentsSign = async (
  sessionId: string,
  documentId: string,
  lawyerName: string,
  lawyerOab: string
): Promise<DocumentSignResponse> => {
  return invoke('documents_sign', {
    sessionId,
    documentId,
    lawyerName,
    lawyerOab
  });
};

export const documentsExportPdf = async (
  sessionId: string,
  documentId: string
): Promise<DocumentExportPdfResponse> => {
  return invoke('documents_export_pdf', {
    sessionId,
    documentId
  });
};

export const documentsGet = async (
  sessionId: string,
  documentId: string
): Promise<DocumentDetail> => {
  return invoke('documents_get', {
    sessionId,
    documentId
  });
};

export const documentsList = async (
  sessionId: string,
  filters: DocumentsListFilters = {}
): Promise<DocumentSummary[]> => {
  return invoke('documents_list', {
    sessionId,
    filters: {
      documentType: filters.documentType,
      status: filters.status,
      clientId: filters.clientId
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
