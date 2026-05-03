import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SceneCornerDto {
  @ApiProperty({ example: 0.18 })
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @ApiProperty({ example: 0.12 })
  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;
}

class SceneCornersDto {
  @ApiProperty({ type: SceneCornerDto })
  @ValidateNested()
  @Type(() => SceneCornerDto)
  topLeft: SceneCornerDto;

  @ApiProperty({ type: SceneCornerDto })
  @ValidateNested()
  @Type(() => SceneCornerDto)
  topRight: SceneCornerDto;

  @ApiProperty({ type: SceneCornerDto })
  @ValidateNested()
  @Type(() => SceneCornerDto)
  bottomRight: SceneCornerDto;

  @ApiProperty({ type: SceneCornerDto })
  @ValidateNested()
  @Type(() => SceneCornerDto)
  bottomLeft: SceneCornerDto;
}

export class UpdateScenePlacementDto {
  @ApiProperty({ type: SceneCornersDto })
  @ValidateNested()
  @Type(() => SceneCornersDto)
  corners: SceneCornersDto;
}
