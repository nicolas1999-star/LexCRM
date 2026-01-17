import { invoke } from '@tauri-apps/api/tauri';

export type CaseIdentifierType = 'CNJ' | 'ADM' | 'OUTRO';

export type CaseSummary = {
  id: string;
  clientId: string;
  identifierType: CaseIdentifierType;
  identifier: string;
  courtCity?: string | null;
  courtUnit?: string | null;
  panel?: string | null;
  rapporteur?: string | null;
  distributedAt?: string | null;
  closedAt?: string | null;
  area?: string | null;
  phase?: string | null;
  valueAmount?: number | null;
  documentsPath?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CaseDetail = CaseSummary;

export type CreateCasePayload = {
  clientId: string;
  identifierType: CaseIdentifierType;
  identifier: string;
  courtCity?: string;
  courtUnit?: string;
  panel?: string;
  rapporteur?: string;
  distributedAt?: string;
  closedAt?: string;
  area?: string;
  phase?: string;
  valueAmount?: number;
  documentsPath?: string;
};

export type UpdateCasePayload = Omit<CreateCasePayload, 'clientId'>;

export const casesList = async (
  sessionId: string,
  clientId: string
): Promise<CaseSummary[]> => {
  return invoke('cases_list', { sessionId, clientId });
};

export const casesGet = async (sessionId: string, id: string): Promise<CaseDetail> => {
  return invoke('cases_get', { sessionId, id });
};

export const casesCreate = async (
  sessionId: string,
  payload: CreateCasePayload
): Promise<CaseDetail> => {
  return invoke('cases_create', { sessionId, payload });
};

export const casesUpdate = async (
  sessionId: string,
  id: string,
  payload: UpdateCasePayload
): Promise<CaseDetail> => {
  return invoke('cases_update', { sessionId, id, payload });
};
