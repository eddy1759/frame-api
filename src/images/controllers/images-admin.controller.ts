/* eslint-disable @typescript-eslint/explicit-function-return-type */
// src/images/controllers/images-admin.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ImagesService } from '../services/images.service';
import { UploadCleanupService } from '../workers/upload-cleanup.worker';
import { ReprocessImageDto } from '../dto/reprocess-image.dto';

@ApiTags('Images Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/images')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ImagesAdminController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly uploadCleanupService: UploadCleanupService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get system-wide image processing statistics' })
  @ApiResponse({ status: 200, description: 'Image stats returned.' })
  async getSystemStats() {
    return this.imagesService.getSystemStats();
  }

  @Post(':id/reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Force image frame reprocess and framed render prewarm for an image as an administrator',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({ status: 202, description: 'Reprocessing triggered.' })
  @ApiResponse({ status: 404, description: 'Image not found.' })
  async reprocessImage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReprocessImageDto,
  ) {
    return this.imagesService.requestReprocess(id, user, dto);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard-delete an image record and all stored variants',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({ status: 204, description: 'Image hard-deleted.' })
  async hardDeleteImage(@Param('id', ParseUUIDPipe) id: string) {
    await this.imagesService.hardDeleteImage(id);
  }

  @Get('orphaned')
  @ApiOperation({
    summary: 'List orphaned or stalled upload sessions for operations review',
  })
  @ApiResponse({ status: 200, description: 'Orphaned sessions returned.' })
  async getOrphanedSessions() {
    return this.imagesService.getOrphanedSessions();
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger image upload cleanup and reservation reclamation',
  })
  @ApiResponse({ status: 202, description: 'Cleanup triggered.' })
  async triggerCleanup() {
    const result = await this.uploadCleanupService.triggerCleanup();
    return { message: 'Cleanup triggered', ...result };
  }
}
