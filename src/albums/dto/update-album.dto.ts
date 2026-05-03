import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAlbumDto {
  @ApiPropertyOptional({
    description: 'Updated album name for the collection.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated public description for the album.',
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
