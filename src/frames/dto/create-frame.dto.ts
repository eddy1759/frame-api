import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FrameOrientation } from '../entities/frame-orientation.enum';
import type { FrameMetadata } from '../utils/frame-metadata.util';

export class CreateFrameDto {
  @ApiProperty({ example: 'Elegant Gold Border' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Premium wedding frame with gold details' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional({ example: 4.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ example: 1920 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width: number;

  @ApiProperty({ example: 1080 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height: number;

  @ApiProperty({ example: '16:9' })
  @IsString()
  @MaxLength(10)
  aspectRatio: string;

  @ApiProperty({ enum: FrameOrientation, example: FrameOrientation.LANDSCAPE })
  @IsEnum(FrameOrientation)
  orientation: FrameOrientation;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      style: 'dynamic',
      palette: ['orange', 'black', 'white'],
      imagePlacement: {
        version: 1,
        fit: 'cover',
        window: {
          x: 0.125,
          y: 0.1111,
          width: 0.75,
          height: 0.7778,
        },
      },
    },
    description:
      'Optional frame metadata. When provided, `imagePlacement` defines the normalized photo window used for framed image rendering.',
  })
  @IsOptional()
  @IsObject()
  metadata?: FrameMetadata;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAiGenerated?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [String], example: ['category-uuid'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['floral', 'gold', 'wedding'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];
}
