/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @ValidateIf((o) => o.frameId !== null)
  @IsUUID()
  frameId?: string | null;
}
