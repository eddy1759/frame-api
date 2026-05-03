import {
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsString,
  IsIn,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryImagesDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter images by attached frame ID.',
  })
  @IsOptional()
  @IsUUID()
  frameId?: string;

  @ApiPropertyOptional({
    description: 'Filter by 360 image flag.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is360?: boolean;

  @ApiPropertyOptional({
    enum: ['pending', 'uploaded', 'processing', 'completed', 'failed'],
    description: 'Filter by processing status.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'uploaded', 'processing', 'completed', 'failed'])
  processingStatus?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'fileSize', 'title'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'fileSize', 'title'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({
    example: '2026-03-01T00:00:00.000Z',
    description: 'Filter images created on or after this ISO date.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-03-31T23:59:59.999Z',
    description: 'Filter images created on or before this ISO date.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
