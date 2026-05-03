import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RegenerateDto {
  @ApiProperty({
    example: 'Keep the floral border but make it more minimal and brighter.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  feedback: string;
}
