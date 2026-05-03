import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '../../auth/enums/user-role.enum';
import { User } from '../../auth/entities/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: "You don't have permission to access this resource",
      });
    }

    return true;
  }
}
