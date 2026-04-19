import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAlbumDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Frame ID used as the album template and contribution frame.',
  })
  @IsUUID()
  frameId: string;

  @ApiPropertyOptional({
    description:
      'Optional album name. Defaults to the frame name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional public description for the album.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
