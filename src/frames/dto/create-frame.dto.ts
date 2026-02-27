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

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

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
