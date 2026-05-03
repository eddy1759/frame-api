import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { User } from '../../auth/entities/user.entity';
import { UserStatus } from '../../auth/enums/user-status.enum';

@Injectable()
export class OptionalJwtGuard implements CanActivate {
  private readonly logger = new Logger(OptionalJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return true;
    }

    const token = header.replace('Bearer ', '').trim();
    if (!token) {
      return true;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if (payload.type !== 'access') {
        return true;
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (user && user.status === UserStatus.ACTIVE && !user.deletedAt) {
        (request as Request & { user?: User }).user = user;
      }
    } catch (error) {
      this.logger.debug(
        `Optional auth ignored invalid token: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    return true;
  }
}
