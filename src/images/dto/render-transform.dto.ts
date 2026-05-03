import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_RENDER_TRANSFORM_OFFSET,
  MAX_RENDER_TRANSFORM_ROTATION,
  MAX_RENDER_TRANSFORM_ZOOM,
  MIN_RENDER_TRANSFORM_OFFSET,
  MIN_RENDER_TRANSFORM_ROTATION,
  MIN_RENDER_TRANSFORM_ZOOM,
  RENDER_TRANSFORM_VERSION,
} from '../utils/render-transform.util';

export class RenderTransformDto {
  @ApiProperty({
    example: RENDER_TRANSFORM_VERSION,
    description: 'Render transform schema version.',
  })
  @Type(() => Number)
  @IsIn([RENDER_TRANSFORM_VERSION])
  version: typeof RENDER_TRANSFORM_VERSION;

  @ApiProperty({
    example: 1.25,
    description:
      'Zoom multiplier applied on top of the minimum cover scale for the frame window.',
    minimum: MIN_RENDER_TRANSFORM_ZOOM,
    maximum: MAX_RENDER_TRANSFORM_ZOOM,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_RENDER_TRANSFORM_ZOOM)
  @Max(MAX_RENDER_TRANSFORM_ZOOM)
  zoom: number;

  @ApiProperty({
    example: 0.18,
    description:
      'Normalized horizontal translation inside the frame window, where -1 is the furthest left legal placement and 1 is the furthest right.',
    minimum: MIN_RENDER_TRANSFORM_OFFSET,
    maximum: MAX_RENDER_TRANSFORM_OFFSET,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_RENDER_TRANSFORM_OFFSET)
  @Max(MAX_RENDER_TRANSFORM_OFFSET)
  offsetX: number;

  @ApiProperty({
    example: -0.12,
    description:
      'Normalized vertical translation inside the frame window, where -1 is the furthest up legal placement and 1 is the furthest down.',
    minimum: MIN_RENDER_TRANSFORM_OFFSET,
    maximum: MAX_RENDER_TRANSFORM_OFFSET,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_RENDER_TRANSFORM_OFFSET)
  @Max(MAX_RENDER_TRANSFORM_OFFSET)
  offsetY: number;

  @ApiPropertyOptional({
    example: 0,
    description:
      'Optional clockwise rotation in degrees applied after scaling around the image center.',
    minimum: MIN_RENDER_TRANSFORM_ROTATION,
    maximum: MAX_RENDER_TRANSFORM_ROTATION,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_RENDER_TRANSFORM_ROTATION)
  @Max(MAX_RENDER_TRANSFORM_ROTATION)
  rotation?: number;
}
