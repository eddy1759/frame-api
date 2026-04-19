import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestUploadUrlDto {
  @ApiProperty({
    example: 'holiday-photo.jpg',
    description: 'Original filename supplied by the client.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @ApiProperty({
    enum: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'],
    example: 'image/jpeg',
    description:
      'Client-declared MIME type. Server-side content detection is still enforced on completion.',
  })
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
  mimeType: string;

  @ApiProperty({
    example: 5242880,
    minimum: 1,
    maximum: 52428800,
    description: 'Expected file size in bytes.',
  })
  @IsNumber()
  @Min(1)
  @Max(52428800) // 50MB
  fileSize: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional frame to attach to the image. Premium frame entitlement is validated against the authenticated user, and the selected frame SVG is snapshotted when upload completion succeeds.',
  })
  @IsOptional()
  @IsUUID()
  frameId?: string;

  @ApiPropertyOptional({
    example: '3mH8cQpL',
    description:
      'Optional public album short code. When supplied, the upload is attached to that album and inherits its frame.',
  })
  @IsOptional()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{8}$/)
  albumShortCode?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Hints whether the upload is intended to be processed as a 360 image.',
  })
  @IsOptional()
  @IsBoolean()
  is360?: boolean;
}
