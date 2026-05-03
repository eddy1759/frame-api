import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AiFrameJobStatus } from '../enums';

export class QueryAiFrameJobsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: Object.values(AiFrameJobStatus),
  })
  @IsOptional()
  @IsString()
  @IsIn(Object.values(AiFrameJobStatus))
  status?: AiFrameJobStatus;
}
