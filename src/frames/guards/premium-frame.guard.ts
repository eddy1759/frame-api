import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { Frame } from '../entities/frame.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class PremiumFrameGuard implements CanActivate {
  constructor(
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawId = request.params.id;
    const frameId = Array.isArray(rawId) ? rawId[0] : rawId;

    const frame = await this.frameRepository.findOne({
      where: { id: frameId, isActive: true },
      select: ['id', 'isPremium'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    if (!frame.isPremium) {
      return true;
    }

    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Authentication token is missing or invalid.',
      });
    }

    const token = header.replace('Bearer ', '').trim();

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Authentication token is missing or invalid.',
      });
    }

    if (!payload.subscriptionActive) {
      throw new ForbiddenException({
        code: 'PREMIUM_REQUIRED',
        message: 'This frame requires an active premium subscription.',
      });
    }

    return true;
  }
}
