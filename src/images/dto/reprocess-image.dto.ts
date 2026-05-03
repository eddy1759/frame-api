import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReprocessImageDto {
  @ApiPropertyOptional({
    example: 2,
    description:
      'Optional optimistic concurrency guard. If supplied, the backend rejects the reprocess when the active render revision has already changed.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedActiveRenderRevision?: number;
}
