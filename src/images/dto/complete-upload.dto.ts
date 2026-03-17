import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class CompleteUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Checksum must be a valid SHA-256 hex string',
  })
  checksum?: string;
}
