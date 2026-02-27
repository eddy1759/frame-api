import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { AuthThrottleGuard } from '../../auth/guards/custom-throttle.guard';
import { CreateFrameDto } from '../dto/create-frame.dto';
import { UpdateFrameDto } from '../dto/update-frame.dto';
import { FrameAssetsService } from '../services/frame-assets.service';
import { FramesService } from '../services/frames.service';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Frames Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(AdminGuard)
@Controller('admin/frames')
export class FramesAdminController {
  constructor(
    private readonly framesService: FramesService,
    private readonly frameAssetsService: FrameAssetsService,
    private readonly throttleGuard: AuthThrottleGuard,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create frame' })
  @ApiResponse({ status: 201, description: 'Frame created' })
  async create(
    @Body() dto: CreateFrameDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    return this.framesService.createFrame(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update frame' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 200, description: 'Frame updated' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFrameDto,
    @Req() req: Request,
  ): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    return this.framesService.updateFrame(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete frame' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 200, description: 'Frame soft deleted' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 30,
      ttlSeconds: 60,
    });
    await this.framesService.softDeleteFrame(id);
    return { message: 'Frame deleted successfully.' };
  }

  @Post(':id/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload SVG and generate thumbnails' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 201, description: 'Assets uploaded' })
  async uploadAssets(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
    @Req() req: Request,
  ): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 30,
      ttlSeconds: 60,
    });
    return this.frameAssetsService.uploadSvgAsset(id, file);
  }
}
