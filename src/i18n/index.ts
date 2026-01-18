import ptBR from './ptBR';

const translations: Record<string, string> = ptBR;

export const t = (key: string): string => translations[key] ?? key;
