import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAiFrameMetadataDto {
  @ApiPropertyOptional({ example: 'Spring Bloom AI Frame' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'Private AI-generated frame for portrait uploads.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
