import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | undefined,
  ): TUser {
    if (err || !user) {
      if (info && info.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Access token has expired. Please refresh your token.',
        });
      }

      if (info && info.name === 'JsonWebTokenError') {
        throw new UnauthorizedException({
          code: 'AUTH_INVALID_TOKEN',
          message: 'The provided token is invalid.',
        });
      }

      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Authentication token is missing or invalid.',
      });
    }

    return user;
  }
}
