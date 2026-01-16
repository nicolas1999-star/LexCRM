import { invoke } from '@tauri-apps/api/tauri';
import type { Session, User } from '../state/auth';

export type BootstrapStatus = { hasAnyUser: boolean };

export type LoginPayload = {
  email: string;
  password: string;
};

export type CreateInitialAdminPayload = {
  name: string;
  email: string;
  password: string;
};

export type AuthResponse = {
  user: User;
  session: Session;
};

export type AppError = {
  code: string;
  message: string;
};

export const authGetBootstrapStatus = async (): Promise<BootstrapStatus> => {
  return invoke('auth_get_bootstrap_status');
};

export const authCreateInitialAdmin = async (
  payload: CreateInitialAdminPayload
): Promise<AuthResponse> => {
  return invoke('auth_create_initial_admin', { payload });
};

export const authLogin = async (payload: LoginPayload): Promise<AuthResponse> => {
  return invoke('auth_login', { payload });
};

export const authLogout = async (sessionId: string): Promise<void> => {
  return invoke('auth_logout', { session_id: sessionId });
};

export const authReauthCheck = async (
  sessionId: string,
  password: string
): Promise<void> => {
  return invoke('auth_reauth_check', { session_id: sessionId, password });
};
