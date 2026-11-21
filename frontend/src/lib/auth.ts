export type Role = "ADMIN" | "EMPLOYEE";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string;
  tenantName: string;
};

export type LoginResponse = {
  accessToken: string;
  user: User;
};

const TOKEN_KEY = "docmind.accessToken";
const USER_KEY = "docmind.user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setSession(accessToken: string, user: User) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function roleLabel(role: Role) {
  return role === "ADMIN" ? "Quản trị viên" : "Nhân viên";
}
