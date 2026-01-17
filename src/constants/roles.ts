import { Role } from '../state/auth';

export const ROLE_LABELS_PT_BR: Record<Role, string> = {
  [Role.ADMIN]: 'Administrador',
  [Role.PARTNER]: 'Sócio / Gestor',
  [Role.COORDINATOR]: 'Coordenador',
  [Role.LAWYER_OWNER]: 'Advogado responsável',
  [Role.LAWYER_ASSOC]: 'Advogado associado',
  [Role.PARALEGAL]: 'Assistente jurídico',
  [Role.FINANCE]: 'Financeiro',
  [Role.SALES]: 'Comercial'
};

export const getRoleLabel = (role?: Role | string | null): string => {
  if (!role) {
    return '';
  }
  return ROLE_LABELS_PT_BR[role as Role] ?? role;
};
