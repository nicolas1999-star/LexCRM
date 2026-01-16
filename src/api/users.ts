import { invoke } from '@tauri-apps/api/tauri';
import type { Role } from '../state/auth';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
};

export type UserDetail = UserSummary;

export type UsersListFilters = {
  q?: string;
  role?: Role | '';
  status?: UserStatus | '';
};

export type CreateUserPayload = {
  name: string;
  email: string;
  role: Role;
  passwordInitial: string;
};

export type UpdateUserPayload = {
  name: string;
  email: string;
  role: Role;
};

export const usersList = async (
  sessionId: string,
  filters: UsersListFilters
): Promise<UserSummary[]> => {
  return invoke('users_list', {
    session_id: sessionId,
    filters: {
      q: filters.q?.trim() || undefined,
      role: filters.role || undefined,
      status: filters.status || undefined
    }
  });
};

export const usersGet = async (sessionId: string, id: string): Promise<UserDetail> => {
  return invoke('users_get', { session_id: sessionId, id });
};

export const usersCreate = async (
  sessionId: string,
  payload: CreateUserPayload
): Promise<UserDetail> => {
  return invoke('users_create', {
    session_id: sessionId,
    payload: {
      name: payload.name,
      email: payload.email,
      role: payload.role,
      passwordInitial: payload.passwordInitial
    }
  });
};

export const usersUpdate = async (
  sessionId: string,
  id: string,
  payload: UpdateUserPayload
): Promise<UserDetail> => {
  return invoke('users_update', {
    session_id: sessionId,
    id,
    payload: {
      name: payload.name,
      email: payload.email,
      role: payload.role
    }
  });
};

export const usersSetStatus = async (
  sessionId: string,
  id: string,
  status: UserStatus
): Promise<UserDetail> => {
  return invoke('users_set_status', { session_id: sessionId, id, status });
};

export const usersResetPassword = async (
  sessionId: string,
  id: string,
  newPassword: string
): Promise<void> => {
  return invoke('users_reset_password', {
    session_id: sessionId,
    id,
    new_password: newPassword
  });
};
