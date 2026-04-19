import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddAlbumImageDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Image ID to ingest into the album.',
  })
  @IsUUID()
  imageId: string;
}
