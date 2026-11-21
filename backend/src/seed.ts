import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { JsonLogger } from './logger/json-logger';

const PASSWORD = 'Demo@123';

const TENANTS = [
  { id: 'a0a0a0a0-0000-4000-8000-000000000001', name: 'Công ty ABC' },
  { id: 'b0b0b0b0-0000-4000-8000-000000000002', name: 'Công ty XYZ' },
];

const USERS = [
  {
    id: 'a0a0a0a0-0000-4000-8000-000000000011',
    tenantId: 'a0a0a0a0-0000-4000-8000-000000000001',
    email: 'admin@abc.vn',
    name: 'Admin ABC',
    role: 'ADMIN',
  },
  {
    id: 'a0a0a0a0-0000-4000-8000-000000000012',
    tenantId: 'a0a0a0a0-0000-4000-8000-000000000001',
    email: 'employee@abc.vn',
    name: 'Nhân viên ABC',
    role: 'EMPLOYEE',
  },
  {
    id: 'b0b0b0b0-0000-4000-8000-000000000021',
    tenantId: 'b0b0b0b0-0000-4000-8000-000000000002',
    email: 'admin@xyz.vn',
    name: 'Admin XYZ',
    role: 'ADMIN',
  },
];

async function seed(): Promise<void> {
  const logger = new JsonLogger();
  const app = await NestFactory.createApplicationContext(AppModule, { logger });
  try {
    const db = app.get(DatabaseService);
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    for (const tenant of TENANTS) {
      await db.query(
        `INSERT INTO tenants (id, name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [tenant.id, tenant.name],
      );
    }

    for (const user of USERS) {
      await db.query(
        `INSERT INTO users (id, tenant_id, email, name, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE
           SET tenant_id = EXCLUDED.tenant_id,
               name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role`,
        [user.id, user.tenantId, user.email, user.name, passwordHash, user.role],
      );
    }

    logger.log(
      `seed complete: ${TENANTS.length} tenants, ${USERS.length} users`,
      'Seed',
    );
  } finally {
    await app.close();
  }
}

seed().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(
    `${JSON.stringify({ level: 'error', time: new Date().toISOString(), message })}\n`,
  );
  process.exit(1);
});
