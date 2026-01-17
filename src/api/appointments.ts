import { invoke } from '@tauri-apps/api/tauri';

export type AppointmentSummary = {
  id: string;
  clientName: string;
  clientDocument: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  title: string;
  attendanceDate: string;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentDetail = AppointmentSummary & {
  history: string;
  analysis: string;
  conclusion: string;
};

export type CreateAppointmentPayload = {
  clientName: string;
  clientDocument: string;
  clientEmail?: string;
  clientPhone?: string;
  title: string;
  attendanceDate: string;
  history: string;
  analysis: string;
  conclusion: string;
};

export const appointmentsList = async (sessionId: string): Promise<AppointmentSummary[]> => {
  return invoke('appointments_list', { sessionId });
};

export const appointmentsGet = async (
  sessionId: string,
  id: string
): Promise<AppointmentDetail> => {
  return invoke('appointments_get', { sessionId, id });
};

export const appointmentsCreate = async (
  sessionId: string,
  payload: CreateAppointmentPayload
): Promise<AppointmentDetail> => {
  return invoke('appointments_create', {
    sessionId,
    payload: {
      clientName: payload.clientName,
      clientDocument: payload.clientDocument,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      title: payload.title,
      attendanceDate: payload.attendanceDate,
      history: payload.history,
      analysis: payload.analysis,
      conclusion: payload.conclusion
    }
  });
};
