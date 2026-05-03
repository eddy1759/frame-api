import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { BusinessException } from '../../common/filters/business.exception';

@Injectable()
export class AiFrameAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (!user || user.role !== UserRole.ADMIN) {
      throw new BusinessException(
        'AUTH_INSUFFICIENT_ROLE',
        "You don't have permission to access this resource",
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
