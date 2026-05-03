import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAlbumDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Frame ID used as the album template and contribution frame.',
  })
  @IsUUID()
  frameId: string;

  @ApiProperty({
    description: 'Album name used as the primary collection identifier.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Optional public description for the album.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Optional personalized short code. Lowercase letters, numbers, and hyphens only after normalization.',
    example: 'edet-wedding-anniversary',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shortCode?: string;
}
