import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchGetImagesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: 50,
    example: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  imageIds: string[];
}
