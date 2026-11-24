import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { resolvePoolConfig } from './resolve-pool-config';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const poolConfig = await resolvePoolConfig({
      databaseUrl: this.config.get<string | null>('databaseUrl') ?? null,
      dbSecretArn: this.config.get<string | null>('dbSecretArn') ?? null,
      awsRegion: this.config.getOrThrow<string>('awsRegion'),
      dbHost: this.config.get<string | null>('dbHost') ?? null,
      dbPort: this.config.get<number | null>('dbPort') ?? null,
      dbName: this.config.get<string | null>('dbName') ?? null,
    });
    this.pool = new Pool(poolConfig);
    this.pool.on('error', (err) => {
      this.logger.error(`idle database client error: ${err.message}`);
    });
    await this.ensureSchema();
    this.logger.log('database schema ready');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  tenantQuery<T extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.asTenant(tenantId, (query) => query<T>(sql, params));
  }

  async asTenant<T>(tenantId: string, fn: (query: QueryFn) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await fn((sql, params = []) => client.query(sql, params));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await rollback(client);
      throw err;
    } finally {
      client.release();
    }
  }

  private async ensureSchema(): Promise<void> {
    const sqlPath = path.join(process.cwd(), 'sql', 'init.sql');
    const sql = await readFile(sqlPath, 'utf8');
    for (const statement of sqlStatements(sql)) {
      await this.pool.query(statement);
    }
  }
}

type QueryFn = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {}
}

function sqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutLineComments
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
