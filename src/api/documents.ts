import { invoke } from '@tauri-apps/api/tauri';

export type DocumentType = 'RELATORIO' | 'PARECER';
export type DocumentStatus = 'DRAFT' | 'SIGNED';

export type DocumentGeneratePayload = {
  documentType: DocumentType;
  officeName?: string;
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

export type DocumentDraftPayload = {
  payloadJson: string;
  htmlPreview: string;
  title: string;
  clientId?: string;
  caseId?: string;
};

export type DocumentSummary = {
  id: string;
  documentType: DocumentType;
  clientId?: string | null;
  title: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  contentSha256?: string | null;
};

export type DocumentDetail = {
  id: string;
  documentType: DocumentType;
  clientId?: string | null;
  caseId?: string | null;
  title: string;
  payloadJson: string;
  htmlPreview: string;
  contentSha256?: string | null;
  signedByLawyerId?: string | null;
  signedByLabel?: string | null;
  signedAt?: string | null;
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
};

export type DocumentExportHtmlResponse = {
  filename: string;
  html: string;
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
): Promise<DocumentDetail> => {
  return invoke('documents_create_draft', {
    sessionId,
    payload: {
      payloadJson: payload.payloadJson,
      htmlPreview: payload.htmlPreview,
      title: payload.title,
      clientId: payload.clientId,
      caseId: payload.caseId
    }
  });
};

export const documentsSign = async (
  sessionId: string,
  documentId: string,
  lawyerId: string
): Promise<DocumentDetail> => {
  return invoke('documents_sign', {
    sessionId,
    documentId,
    lawyerId
  });
};

export const documentsExportHtml = async (
  sessionId: string,
  documentId: string
): Promise<DocumentExportHtmlResponse> => {
  return invoke('documents_export_html', {
    sessionId,
    payload: {
      documentId
    }
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
