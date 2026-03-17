import {
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsString,
  IsIn,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryImagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  frameId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is360?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'uploaded', 'processing', 'completed', 'failed'])
  processingStatus?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'fileSize', 'title'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
