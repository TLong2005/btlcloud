import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { StorageService } from './storage.service';

export class LocalStorageService implements StorageService {
  constructor(private readonly root: string) {}

  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  private resolve(key: string): string {
    const parts = key.split('/').filter((part) => part && part !== '.' && part !== '..');
    if (parts.length === 0) {
      throw new Error('Invalid storage key');
    }
    const full = path.resolve(this.root, ...parts);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }
}
