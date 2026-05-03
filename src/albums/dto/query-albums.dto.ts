import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryAlbumsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: '3mH8cQpL',
    description:
      'Exact album short code match. Supports both legacy 8-character codes and newer personalized codes.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shortCode?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exact frame ID match.',
  })
  @IsOptional()
  @IsUUID()
  frameId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exact album owner ID match.',
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive creator display name search.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  creator?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive partial search across album name and short code.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
