import { ApiError } from "@/lib/api";
import { clearSession, getToken } from "@/lib/auth";

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

export function uploadDocument(file: File, onProgress: (percent: number) => void) {
  return sendDocument("POST", "/api/documents", file, onProgress);
}

export function replaceDocument(
  id: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return sendDocument("PUT", `/api/documents/${id}/content`, file, onProgress);
}

export async function downloadDocument(id: string, filename: string) {
  const token = getToken();
  const response = await fetch(`/api/documents/${id}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    clearSession();
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Phiên đăng nhập đã hết hạn");
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      payload = null;
    }
    throw new ApiError(response.status, errorMessage(payload, "Không thể tải tệp xuống"));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function openDocument(id: string, filename: string) {
  const token = getToken();
  const response = await fetch(`/api/documents/${id}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    clearSession();
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Phiên đăng nhập đã hết hạn");
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      payload = null;
    }
    throw new ApiError(response.status, errorMessage(payload, "Không thể mở tệp"));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sendDocument(
  method: "POST" | "PUT",
  url: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearSession();
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
        reject(new ApiError(401, "Phiên đăng nhập đã hết hạn"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText) as unknown;
      } catch {
        payload = null;
      }
      reject(new ApiError(xhr.status, errorMessage(payload, "Không thể tải tệp lên")));
    };

    xhr.onerror = () => {
      reject(new ApiError(0, "Không thể tải tệp lên"));
    };

    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}
