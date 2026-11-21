import { readdir, readFile } from 'fs/promises';
import path from 'path';

const CONCURRENCY = 10;
const EMAIL = 'admin@abc.vn';
const PASSWORD = 'Demo@123';

interface UploadTask {
  filePath: string;
  filename: string;
}

async function main(): Promise<void> {
  const count = readCount();
  const base = readBase();
  const started = Date.now();
  const token = await login(base);
  const tasks = await buildTasks(count);
  let success = 0;
  let failed = 0;
  let firstError = '';

  await runPool(tasks, CONCURRENCY, async (task) => {
    try {
      const response = await upload(base, token, task);
      if (response.ok) {
        success += 1;
        return;
      }
      failed += 1;
      if (!firstError) {
        firstError = `${response.status} ${await response.text()}`;
      }
    } catch (err) {
      failed += 1;
      if (!firstError) {
        firstError = err instanceof Error ? err.message : String(err);
      }
    }
  });

  if (firstError) {
    process.stderr.write(`${firstError}\n`);
  }
  process.stdout.write(`success: ${success}\n`);
  process.stdout.write(`failed: ${failed}\n`);
  process.stdout.write(`total time: ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function readCount(): number {
  const raw = readArg('count');
  const count = raw === undefined ? 50 : Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('--count must be a positive integer');
  }
  return count;
}

function readBase(): string {
  return (readArg('base') ?? 'http://localhost:4000').replace(/\/$/, '');
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function login(base: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new Error('login failed: missing accessToken');
  }
  return body.accessToken;
}

async function buildTasks(count: number): Promise<UploadTask[]> {
  const dir = path.resolve(process.cwd(), 'samples');
  const names = (await readdir(dir)).filter((name) => !name.startsWith('.')).sort();
  if (names.length === 0) {
    throw new Error('samples directory is empty');
  }
  const tasks: UploadTask[] = [];
  for (const name of names) {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    for (let n = 1; n <= count; n++) {
      tasks.push({
        filePath: path.join(dir, name),
        filename: `${base}-${n}${ext}`,
      });
    }
  }
  return tasks;
}

async function upload(base: string, token: string, task: UploadTask): Promise<Response> {
  const bytes = await readFile(task.filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes]), task.filename);
  return fetch(`${base}/api/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

async function runPool(
  tasks: UploadTask[],
  limit: number,
  fn: (task: UploadTask) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      await fn(tasks[index]);
    }
  });
  await Promise.all(workers);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
