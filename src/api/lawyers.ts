import { invoke } from '@tauri-apps/api/tauri';

export type LawyerSummary = {
  id: string;
  name: string;
  oab: string;
  oabUf: string;
};

export type LawyerDetail = {
  id: string;
  name: string;
  oab: string;
  oabUf: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LawyerPayload = {
  name: string;
  oab: string;
  oabUf: string;
  email?: string;
  phone?: string;
  address?: string;
};

export const lawyersList = async (sessionId: string): Promise<LawyerSummary[]> => {
  return invoke('lawyers_list', { sessionId });
};

export const lawyersCreate = async (
  sessionId: string,
  payload: LawyerPayload
): Promise<LawyerDetail> => {
  return invoke('lawyers_create', {
    sessionId,
    payload: {
      name: payload.name,
      oab: payload.oab,
      oabUf: payload.oabUf,
      email: payload.email,
      phone: payload.phone,
      address: payload.address
    }
  });
};
