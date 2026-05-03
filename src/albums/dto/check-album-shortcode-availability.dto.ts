import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CheckAlbumShortCodeAvailabilityDto {
  @ApiProperty({
    description:
      'Short code candidate to validate. The backend normalizes it before checking availability.',
    example: 'Edet Wedding Anniversary',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  shortCode: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional album ID to exclude during uniqueness checks when editing an existing album.',
  })
  @IsOptional()
  @IsUUID()
  excludeAlbumId?: string;
}
