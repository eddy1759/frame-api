import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RenderTransformDto } from './render-transform.dto';

export class CompleteUploadDto {
  @ApiPropertyOptional({
    example: 'Sunset Portrait',
    description:
      'Optional display title stored on the image record that will later serve signed raw or composited variants.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'Captured during a beach session.',
    description:
      'Optional image description stored alongside the upload and any active frame snapshot state.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: '7d6f5f9da9ebf6b8dc7ad0f97fb2cb7f58db9ad5d2b9b3c6d8d92b26e8f04769',
    description:
      'Optional SHA-256 checksum. If supplied, the server verifies it against the uploaded object.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Checksum must be a valid SHA-256 hex string',
  })
  checksum?: string;

  @ApiPropertyOptional({
    type: RenderTransformDto,
    description:
      'Optional normalized crop/zoom/rotation transform captured by the client editor for deterministic framed rendering.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RenderTransformDto)
  transform?: RenderTransformDto;
}
