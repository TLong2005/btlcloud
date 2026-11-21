export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface StorageService {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

export function sanitizeFilename(filename: string): string {
  const base = filename
    .split(/[/\\]/)
    .filter((part) => part && part !== '.' && part !== '..')
    .pop() ?? '';
  const cleaned = base.replace(/[/\\]/g, '').replace(/\0/g, '').trim();
  return cleaned || 'file';
}

export function documentStorageKey(
  tenantId: string,
  documentId: string,
  filename: string,
): string {
  return `tenants/${tenantId}/${documentId}/${sanitizeFilename(filename)}`;
}

export function replacementStorageKey(
  tenantId: string,
  documentId: string,
  filename: string,
  version: string,
): string {
  return `tenants/${tenantId}/${documentId}/${version}/${sanitizeFilename(filename)}`;
}
