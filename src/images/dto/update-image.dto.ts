/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RenderTransformDto } from './render-transform.dto';

export class UpdateImageDto {
  @ApiPropertyOptional({
    example: 'Edited Title',
    description: 'Updated display title for the image.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated private note for this image.',
    description: 'Updated image description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Attach a different frame ID or send null to stage frame removal. Visual output changes are not promoted until POST /images/:id/reprocess is called.',
  })
  @IsOptional()
  @ValidateIf((o) => o.frameId !== null)
  @IsUUID()
  frameId?: string | null;

  @ApiPropertyOptional({
    type: RenderTransformDto,
    nullable: true,
    description:
      'Optional staged render transform for the next framed render revision. Send null only when clearing a pending transform by resetting staged changes.',
  })
  @IsOptional()
  @ValidateIf((o) => o.transform !== null)
  @ValidateNested()
  @Type(() => RenderTransformDto)
  transform?: RenderTransformDto | null;
}
