import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { isUserRole, JwtPayload, PublicUser } from './auth-user';
import { LoginDto } from './dto/login.dto';

const INVALID_LOGIN = 'Email hoặc mật khẩu không đúng';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  tenant_id: string;
  tenant_name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; user: PublicUser }> {
    const result = await this.db.query<UserRow>(
      `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.tenant_id, t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1`,
      [dto.email.trim()],
    );
    const row = result.rows[0];
    const matches = row ? await bcrypt.compare(dto.password, row.password_hash) : false;
    if (!row || !matches || !isUserRole(row.role)) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    const payload: JwtPayload = {
      sub: row.id,
      tenantId: row.tenant_id,
      role: row.role,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: toPublicUser(row) };
  }

  async me(user: JwtPayload): Promise<PublicUser> {
    const result = await this.db.query<UserRow>(
      `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.tenant_id, t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [user.sub, user.tenantId],
    );
    const row = result.rows[0];
    if (!row || !isUserRole(row.role)) {
      throw new UnauthorizedException('Không được phép truy cập');
    }
    return toPublicUser(row);
  }
}

function toPublicUser(row: UserRow): PublicUser {
  if (!isUserRole(row.role)) {
    throw new UnauthorizedException(INVALID_LOGIN);
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
  };
}
