export function formatBytes(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "—";
  if (sizeBytes < 1024 * 1024) {
    const kb = sizeBytes / 1024;
    return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  }
  const mb = sizeBytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatScore(score: number) {
  const percent = score <= 1 ? score * 100 : score;
  return `${Math.round(percent)}%`;
}
