import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { QueryAiFrameJobsDto } from './query-ai-frame-jobs.dto';

export class AdminQueryAiFrameJobsDto extends QueryAiFrameJobsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
