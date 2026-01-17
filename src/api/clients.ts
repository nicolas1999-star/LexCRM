import { invoke } from '@tauri-apps/api/tauri';

export type ClientType = 'PF' | 'PJ';
export type ClientStatus = 'ACTIVE' | 'ARCHIVED';

export type ClientSummary = {
  id: string;
  type: ClientType;
  name: string;
  cpfCnpj: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
};

export type ClientDetail = ClientSummary & {
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type ClientsListFilters = {
  q?: string;
  type?: ClientType | '';
  status?: ClientStatus | '';
};

export type CreateClientPayload = {
  type: ClientType;
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  notes?: string;
};

export type UpdateClientPayload = CreateClientPayload;

export const clientsList = async (
  sessionId: string,
  filters: ClientsListFilters
): Promise<ClientSummary[]> => {
  return invoke('clients_list', {
    sessionId,
    filters: {
      q: filters.q?.trim() || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined
    }
  });
};

export const clientsGet = async (sessionId: string, id: string): Promise<ClientDetail> => {
  return invoke('clients_get', { sessionId, id });
};

export const clientsCreate = async (
  sessionId: string,
  payload: CreateClientPayload
): Promise<ClientDetail> => {
  return invoke('clients_create', {
    sessionId,
    payload: {
      type: payload.type,
      name: payload.name,
      cpfCnpj: payload.cpfCnpj,
      email: payload.email,
      phone: payload.phone,
      notes: payload.notes
    }
  });
};

export const clientsUpdate = async (
  sessionId: string,
  id: string,
  payload: UpdateClientPayload
): Promise<ClientDetail> => {
  return invoke('clients_update', {
    sessionId,
    id,
    payload: {
      type: payload.type,
      name: payload.name,
      cpfCnpj: payload.cpfCnpj,
      email: payload.email,
      phone: payload.phone,
      notes: payload.notes
    }
  });
};

export const clientsArchive = async (sessionId: string, id: string): Promise<void> => {
  return invoke('clients_archive', { sessionId, id });
};
