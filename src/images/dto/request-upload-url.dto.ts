import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
  MaxLength,
  Min,
  Max,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { isValidAlbumShortCode } from '../../albums/utils/album-shortcode.util';

export const REQUEST_UPLOAD_ALBUM_SHORT_CODE_MESSAGE =
  'Album short code must be either an 8-character share code or a 4-32 character slug using lowercase letters, numbers, or hyphens.';

function IsAlbumShortCode(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAlbumShortCode',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidAlbumShortCode(value);
        },
        defaultMessage(): string {
          return REQUEST_UPLOAD_ALBUM_SHORT_CODE_MESSAGE;
        },
      },
    });
  };
}

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
    example: 'family-reunion-2026',
    description:
      'Optional public album short code. Accepts either a legacy 8-character share code or a custom 4-32 character slug. When supplied, the upload is attached to that album and inherits its frame.',
  })
  @IsOptional()
  @IsAlbumShortCode({
    message: REQUEST_UPLOAD_ALBUM_SHORT_CODE_MESSAGE,
  })
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
