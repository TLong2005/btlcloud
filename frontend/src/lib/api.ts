import { clearSession, getToken, type LoginResponse } from "@/lib/auth";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
  redirectOnUnauthorized?: boolean;
};

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }

  const message = (payload as { message: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const text = message.map(String).filter(Boolean).join(", ");
    if (text) return text;
  }
  return fallback;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { redirectOnUnauthorized = true, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  const token = getToken();

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (
    rest.body &&
    !(rest.body instanceof FormData) &&
    !requestHeaders.has("Content-Type")
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...rest,
    headers: requestHeaders,
    cache: "no-store",
  });

  if (response.status === 401 && redirectOnUnauthorized) {
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError(
      response.status,
      errorMessage(payload, "Không thể hoàn tất yêu cầu"),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function login(email: string, password: string) {
  return api<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    redirectOnUnauthorized: false,
  });
}
