import type { AppError } from './auth';

const parseJsonMessage = (message: string): AppError | null => {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith('{')
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as AppError;
  } catch {
    return null;
  }
};

const extractMessage = (err: unknown): string | null => {
  if (!err) {
    return null;
  }

  if (typeof err === 'string') {
    return err;
  }

  if (err instanceof Error) {
    const parsed = parseJsonMessage(err.message);
    return parsed?.message ?? err.message ?? null;
  }

  if (typeof err === 'object') {
    if ('message' in err && typeof err.message === 'string') {
      return err.message;
    }
    if ('error' in err) {
      return extractMessage((err as { error?: unknown }).error);
    }
  }

  return null;
};

export const getErrorMessage = (err: unknown, fallback: string): string => {
  return extractMessage(err) ?? fallback;
};
