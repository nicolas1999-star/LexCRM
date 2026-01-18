import { invoke } from '@tauri-apps/api/tauri';

export type AttendanceChannel = 'PRESENCIAL' | 'WHATSAPP' | 'TELEFONE' | 'EMAIL' | 'VIDEO';

export type AttendanceSummary = {
  id: string;
  clientId: string;
  occurredAt: string;
  channel: AttendanceChannel;
  subject: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceDetail = AttendanceSummary;

export type AttendancePayload = {
  occurredAt: string;
  channel: AttendanceChannel;
  subject: string;
  notes: string;
};

export const attendancesList = async (
  sessionId: string,
  clientId: string
): Promise<AttendanceSummary[]> => {
  return invoke('attendances_list', { sessionId, clientId });
};

export const attendancesCreate = async (
  sessionId: string,
  clientId: string,
  payload: AttendancePayload
): Promise<AttendanceDetail> => {
  return invoke('attendances_create', { sessionId, clientId, payload });
};

export const attendancesUpdate = async (
  sessionId: string,
  attendanceId: string,
  payload: AttendancePayload
): Promise<AttendanceDetail> => {
  return invoke('attendances_update', { sessionId, attendanceId, payload });
};

export const attendancesDelete = async (
  sessionId: string,
  attendanceId: string
): Promise<void> => {
  return invoke('attendances_delete', { sessionId, attendanceId });
};
