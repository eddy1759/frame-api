import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceInfoDto } from './oauth-login.dto';

export class AdminSignInDto {
  @ApiProperty({
    description: 'Admin account email address',
    example: 'admin@example.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'Admin account password',
    example: 'CorrectHorseBatteryStaple!',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password: string;

  @ApiPropertyOptional({
    description: 'Device information for session tracking',
    type: DeviceInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
