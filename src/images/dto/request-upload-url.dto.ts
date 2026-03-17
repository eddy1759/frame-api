import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class RequestUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(52428800) // 50MB
  fileSize: number;

  @IsOptional()
  @IsUUID()
  frameId?: string;

  @IsOptional()
  @IsBoolean()
  is360?: boolean;
}
