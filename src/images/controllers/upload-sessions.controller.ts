/* eslint-disable @typescript-eslint/explicit-function-return-type */
// src/images/controllers/upload-sessions.controller.ts
import {
  Controller,
  Get,
  Post,
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UploadService } from '../services/upload.service';

@ApiTags('Image Upload Sessions')
@ApiBearerAuth('JWT-auth')
@Controller('images/upload-sessions')
@UseGuards(JwtAuthGuard)
export class UploadSessionsController {
  constructor(private readonly uploadService: UploadService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get the authenticated user upload session state',
  })
  @ApiParam({ name: 'id', description: 'Upload session ID' })
  @ApiResponse({ status: 200, description: 'Upload session returned.' })
  @ApiResponse({ status: 403, description: 'Session does not belong to user.' })
  @ApiResponse({ status: 404, description: 'Upload session not found.' })
  async getUploadSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.uploadService.getUploadSession(id, userId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel a pending upload session and release reserved quota',
  })
  @ApiParam({ name: 'id', description: 'Upload session ID' })
  @ApiResponse({ status: 204, description: 'Upload session cancelled.' })
  @ApiResponse({ status: 403, description: 'Session does not belong to user.' })
  @ApiResponse({ status: 404, description: 'Upload session not found.' })
  async cancelUploadSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.uploadService.cancelUploadSession(id, userId);
  }
}
