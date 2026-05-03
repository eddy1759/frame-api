import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AI_FRAME_SUPPORTED_ASPECT_RATIOS } from '../ai-frame.constants';

export class GenerateAiFrameDto {
  @ApiProperty({
    example: 'A celebratory floral frame with gold filigree and soft light',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  prompt: string;

  @ApiProperty({
    example: '9:16',
    enum: AI_FRAME_SUPPORTED_ASPECT_RATIOS,
  })
  @IsString()
  @IsIn(AI_FRAME_SUPPORTED_ASPECT_RATIOS)
  aspectRatio: string;

  @ApiPropertyOptional({ example: 'luxury floral editorial' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  styleHint?: string;

  @ApiPropertyOptional({ example: 'gold, ivory, blush pink' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorHint?: string;
}
