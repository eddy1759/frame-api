import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { BusinessException } from '../../common/filters/business.exception';
import { AiFrameJob } from '../entities';

interface AiFrameRequest extends Request {
  user?: Pick<User, 'id' | 'role'>;
  params: {
    jobId?: string;
  };
}

@Injectable()
export class AiFrameOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(AiFrameJob)
    private readonly aiFrameJobRepository: Repository<AiFrameJob>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AiFrameRequest>();
    const userId = request.user?.id;
    const jobId = request.params?.jobId;

    if (!userId || !jobId) {
      throw new BusinessException(
        'UNAUTHORIZED',
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const job = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
      select: ['id', 'userId'],
    });

    if (!job) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      request.user?.role !== UserRole.ADMIN &&
      job.userId !== request.user?.id
    ) {
      throw new BusinessException(
        'AI_FRAME_NOT_OWNED',
        'You do not have access to this AI frame job.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
