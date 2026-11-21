export type UserRole = 'ADMIN' | 'EMPLOYEE';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  tenantName: string;
}

export function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'EMPLOYEE';
}
