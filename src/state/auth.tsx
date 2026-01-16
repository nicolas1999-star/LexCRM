import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export enum Role {
  ADMIN = 'ADMIN',
  PARTNER = 'PARTNER',
  COORDINATOR = 'COORDINATOR',
  LAWYER_OWNER = 'LAWYER_OWNER',
  LAWYER_ASSOC = 'LAWYER_ASSOC',
  PARALEGAL = 'PARALEGAL',
  FINANCE = 'FINANCE',
  SALES = 'SALES'
}

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  lastLoginAt?: string | null;
};

export type Session = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  sessionId: string | null;
  setSession: (user: User, session: Session) => void;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_STORAGE_KEY = 'lexcrm.session_id';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  });

  const setSession = useCallback((nextUser: User, nextSession: Session) => {
    setUser(nextUser);
    setSessionState(nextSession);
    setSessionId(nextSession.id);
    localStorage.setItem(SESSION_STORAGE_KEY, nextSession.id);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setSessionState(null);
    setSessionId(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      sessionId,
      setSession,
      clearSession
    }),
    [user, session, sessionId, setSession, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
