import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

export class BatchGetImagesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  imageIds: string[];
}
