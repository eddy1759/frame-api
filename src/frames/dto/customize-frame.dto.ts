import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CustomizeFrameDto {
  @ApiProperty({ example: 'Edet Wedding Anniversary' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  customTitle: string;
}
