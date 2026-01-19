import { invoke } from '@tauri-apps/api/tauri';

export type OfficeProfile = {
  id: string;
  officeName: string;
  officeAddress: string;
  officeEmail: string;
  officePhone: string;
  logoDataUrl: string;
  defaultLawyerId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OfficeProfilePayload = {
  officeName?: string;
  officeAddress?: string;
  officeEmail?: string;
  officePhone?: string;
  logoDataUrl?: string;
  defaultLawyerId?: string | null;
};

export const officeGet = async (sessionId: string): Promise<OfficeProfile> => {
  return invoke('office_get', { sessionId });
};

export const officeUpdate = async (
  sessionId: string,
  payload: OfficeProfilePayload
): Promise<OfficeProfile> => {
  return invoke('office_update', {
    sessionId,
    payload: {
      officeName: payload.officeName,
      officeAddress: payload.officeAddress,
      officeEmail: payload.officeEmail,
      officePhone: payload.officePhone,
      logoDataUrl: payload.logoDataUrl,
      defaultLawyerId: payload.defaultLawyerId
    }
  });
};
