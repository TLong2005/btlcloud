import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { PoolConfig } from 'pg';

export async function resolvePoolConfig(options: {
  databaseUrl: string | null;
  dbSecretArn: string | null;
  awsRegion: string;
}): Promise<PoolConfig> {
  if (options.dbSecretArn) {
    const client = new SecretsManagerClient({ region: options.awsRegion });
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: options.dbSecretArn }),
    );
    if (!result.SecretString) {
      throw new Error('DB secret has no SecretString');
    }
    return poolConfigFromSecret(result.SecretString);
  }

  if (!options.databaseUrl) {
    throw new Error('Set DATABASE_URL or DB_SECRET_ARN');
  }
  return { connectionString: options.databaseUrl };
}

function poolConfigFromSecret(secret: string): PoolConfig {
  const trimmed = secret.trim();
  if (
    trimmed.startsWith('postgres://') ||
    trimmed.startsWith('postgresql://')
  ) {
    return { connectionString: trimmed };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error('DB secret is neither a postgres URL nor JSON');
  }

  const url = parsed.url ?? parsed.connectionString ?? parsed.DATABASE_URL;
  if (typeof url === 'string' && url.trim()) {
    return { connectionString: url.trim() };
  }

  const user = asNonEmptyString(parsed.username);
  const password = typeof parsed.password === 'string' ? parsed.password : null;
  const host = asNonEmptyString(parsed.host);
  const database = asNonEmptyString(parsed.dbname ?? parsed.database);
  const port = asPort(parsed.port ?? 5432);

  if (!user || password === null || password === '' || !host || !database || port === null) {
    throw new Error(
      'DB secret JSON must include username, password, host, port, and dbname',
    );
  }

  return { host, port, user, password, database };
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asPort(value: unknown): number | null {
  const port = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }
  return port;
}
