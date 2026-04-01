/* eslint-disable @typescript-eslint/explicit-function-return-type */
// src/images/controllers/images.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
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
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ImagesService } from '../services/images.service';
import { UploadService } from '../services/upload.service';
import { ImageProcessingService } from '../services/image-processing.service';
import { RequestUploadUrlDto } from '../dto/request-upload-url.dto';
import { CompleteUploadDto } from '../dto/complete-upload.dto';
import { UpdateImageDto } from '../dto/update-image.dto';
import { QueryImagesDto } from '../dto/query-images.dto';
import { BatchGetImagesDto } from '../dto/batch-get-images.dto';
import { ReprocessImageDto } from '../dto/reprocess-image.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('Images')
@ApiBearerAuth('JWT-auth')
@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly uploadService: UploadService,
    private readonly imageProcessingService: ImageProcessingService,
  ) {}

  @Post('upload-url')
  @ApiOperation({
    summary: 'Create a private image upload session and presigned upload URL',
  })
  @ApiResponse({
    status: 201,
    description:
      'Upload session created. The response includes a presigned PUT URL for temporary storage.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid filename, MIME type, or file size.',
  })
  @ApiResponse({
    status: 403,
    description:
      'The selected premium frame is not available to the authenticated user.',
  })
  @ApiResponse({
    status: 429,
    description: 'Daily upload limit reached for the authenticated user.',
  })
  async requestUploadUrl(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: RequestUploadUrlDto,
  ) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.uploadService.requestUploadUrl(user, dto, ipAddress, userAgent);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Confirm upload completion and queue private image processing',
  })
  @ApiParam({ name: 'id', description: 'Image/upload session ID' })
  @ApiResponse({
    status: 202,
    description:
      'Upload confirmed. The image record was created and processing was queued or marked for recovery requeue.',
  })
  @ApiResponse({
    status: 403,
    description:
      'The upload session does not belong to the authenticated user.',
  })
  @ApiResponse({
    status: 404,
    description: 'Upload session not found.',
  })
  @ApiResponse({
    status: 410,
    description: 'Upload session expired or is no longer completable.',
  })
  @ApiResponse({
    status: 422,
    description:
      'Uploaded object failed server-side validation such as checksum, size, or image type detection.',
  })
  async completeUpload(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.uploadService.completeUpload(id, userId, dto);
  }

  @Get('storage')
  @ApiOperation({
    summary: 'Get the authenticated user storage quota and usage summary',
  })
  @ApiResponse({ status: 200, description: 'Storage summary returned.' })
  async getStorageSummary(@CurrentUser('id') userId: string) {
    return this.imagesService.getStorageSummary(userId);
  }

  @Post('batch')
  @ApiOperation({
    summary:
      'Fetch multiple authenticated-user images at once with signed thumbnail URLs',
  })
  @ApiResponse({ status: 200, description: 'Images returned.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid image ID list.',
  })
  async batchGetImages(
    @CurrentUser('id') userId: string,
    @Body() dto: BatchGetImagesDto,
  ) {
    return this.imagesService.batchGetImages(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List authenticated-user images with filters and signed URLs',
  })
  @ApiResponse({ status: 200, description: 'Paginated images returned.' })
  async listImages(
    @CurrentUser('id') userId: string,
    @Query() query: QueryImagesDto,
  ) {
    return this.imagesService.listImages(userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single authenticated-user image with signed variant URLs',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({
    status: 200,
    description:
      'Returns signed variant URLs. When a frame is active, thumbnail and display variants are served from composited render-cache outputs; pending changes are reflected via frameRenderStatus and pendingFrameId.',
  })
  @ApiResponse({ status: 404, description: 'Image not found.' })
  async getImage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imagesService.getImageById(id, userId);
  }

  @Get(':id/processing-status')
  @ApiOperation({
    summary: 'Get processing progress and completed variants for an image',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({
    status: 200,
    description:
      'Processing status returned. If the image record is missing, a not_found status payload is returned.',
  })
  async getProcessingStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.imageProcessingService.getProcessingStatus(
      id,
      userId,
    );

    if (!result) {
      return {
        imageId: id,
        processingStatus: 'not_found',
        variants: [],
        completedAt: null,
      };
    }

    return result;
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update authenticated-user image metadata and stage an optional frame or transform change for manual reprocess',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({ status: 200, description: 'Image updated.' })
  @ApiResponse({
    status: 403,
    description:
      'The requested premium frame is not available to the authenticated user.',
  })
  @ApiResponse({ status: 404, description: 'Image not found.' })
  async updateImage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImageDto,
  ) {
    return this.imagesService.updateImage(id, user, dto);
  }

  @Post(':id/reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Promote any pending frame or transform change and prewarm composited render variants for the authenticated owner',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({
    status: 202,
    description:
      'Frame reprocess accepted. The active render revision is refreshed and framed cache prewarm is queued when applicable.',
  })
  @ApiResponse({ status: 404, description: 'Image not found.' })
  async reprocessImage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReprocessImageDto,
  ) {
    return this.imagesService.requestReprocess(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete an authenticated-user image and reclaim quota',
  })
  @ApiParam({ name: 'id', description: 'Image ID' })
  @ApiResponse({ status: 204, description: 'Image deleted.' })
  async deleteImage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.imagesService.deleteImage(id, userId);
  }
}
