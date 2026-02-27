import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ example: 'floral' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
