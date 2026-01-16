import { invoke } from '@tauri-apps/api/tauri';

export type Team = {
  id: string;
  name: string;
  description?: string | null;
  leadUserId?: string | null;
  leadName?: string | null;
  leadEmail?: string | null;
  memberCount: number;
  memberUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateTeamPayload = {
  name: string;
  description?: string;
  leadUserId?: string;
  memberUserIds: string[];
};

export type UpdateTeamPayload = {
  name: string;
  description?: string;
  leadUserId?: string;
};

export const teamsList = async (sessionId: string): Promise<Team[]> => {
  return invoke('teams_list', { session_id: sessionId });
};

export const teamsCreate = async (
  sessionId: string,
  payload: CreateTeamPayload
): Promise<Team> => {
  return invoke('teams_create', {
    session_id: sessionId,
    payload: {
      name: payload.name,
      description: payload.description,
      leadUserId: payload.leadUserId,
      memberUserIds: payload.memberUserIds
    }
  });
};

export const teamsUpdate = async (
  sessionId: string,
  id: string,
  payload: UpdateTeamPayload
): Promise<Team> => {
  return invoke('teams_update', {
    session_id: sessionId,
    id,
    payload: {
      name: payload.name,
      description: payload.description,
      leadUserId: payload.leadUserId
    }
  });
};

export const teamsSetMembers = async (
  sessionId: string,
  teamId: string,
  userIds: string[]
): Promise<Team> => {
  return invoke('teams_set_members', {
    session_id: sessionId,
    team_id: teamId,
    user_ids: userIds
  });
};

export const teamsDelete = async (sessionId: string, id: string): Promise<void> => {
  return invoke('teams_delete_or_archive', { session_id: sessionId, id });
};
