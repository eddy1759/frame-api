import { PartialType } from '@nestjs/swagger';
import { CreateFrameDto } from './create-frame.dto';

export class UpdateFrameDto extends PartialType(CreateFrameDto) {}
