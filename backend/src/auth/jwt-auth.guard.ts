import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUserRole, JwtPayload } from './auth-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: JwtPayload;
    }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Không được phép truy cập');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice('Bearer '.length).trim());
      if (!payload.sub || !payload.tenantId || !isUserRole(payload.role)) {
        throw new Error('invalid payload');
      }
      request.user = {
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Không được phép truy cập');
    }
  }
}
