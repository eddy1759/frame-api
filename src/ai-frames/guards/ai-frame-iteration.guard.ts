import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { BusinessException } from '../../common/filters/business.exception';
import { AiFrameIteration } from '../entities';

interface IterationRequest extends Request {
  params: {
    jobId?: string;
  };
  body: {
    iterationId?: string;
  };
}

@Injectable()
export class AiFrameIterationGuard implements CanActivate {
  constructor(
    @InjectRepository(AiFrameIteration)
    private readonly aiFrameIterationRepository: Repository<AiFrameIteration>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IterationRequest>();
    const jobId = request.params?.jobId;
    const iterationId = request.body?.iterationId;

    if (!jobId || !iterationId) {
      throw new BusinessException(
        'AI_FRAME_ITERATION_NOT_FOUND',
        'AI frame iteration not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const iteration = await this.aiFrameIterationRepository.findOne({
      where: {
        id: iterationId,
        jobId,
      },
      select: ['id'],
    });

    if (!iteration) {
      throw new BusinessException(
        'AI_FRAME_ITERATION_NOT_FOUND',
        'AI frame iteration not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return true;
  }
}
