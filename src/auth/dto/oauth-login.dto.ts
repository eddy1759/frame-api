import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppleNameDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class DeviceInfoDto {
  @ApiPropertyOptional({ example: 'Frame/1.0.0 (iPhone; iOS 17.2)' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ example: 'ios' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class OAuthLoginDto {
  @ApiProperty({
    description:
      'OAuth token from the provider (ID token for Google, identity token for Apple)',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'Apple full name (only sent on first Apple sign-in)',
    type: AppleNameDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleNameDto)
  fullName?: AppleNameDto;

  @ApiPropertyOptional({
    description: 'Device information for session tracking',
    type: DeviceInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
