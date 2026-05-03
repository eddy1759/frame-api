import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AcceptIterationDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID()
  iterationId: string;
}
