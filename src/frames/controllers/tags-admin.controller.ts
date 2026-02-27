import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthThrottleGuard } from '../../auth/guards/custom-throttle.guard';
import { TagsService } from '../services/tags.service';
import { CreateTagDto } from '../dto/create-tag.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Frames Admin Tags')
@ApiBearerAuth('JWT-auth')
@UseGuards(AdminGuard)
@Controller('admin/frames/tags')
export class TagsAdminController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly throttleGuard: AuthThrottleGuard,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create tag' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  async create(@Body() dto: CreateTagDto, @Req() req: Request): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    return this.tagsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tags (admin)' })
  @ApiResponse({ status: 200, description: 'Tags returned' })
  async list(): Promise<unknown> {
    return this.tagsService.list(200);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag updated' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
    @Req() req: Request,
  ): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    return this.tagsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tag and detach frame links' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag deleted' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 30,
      ttlSeconds: 60,
    });
    await this.tagsService.remove(id);
    return { message: 'Tag deleted successfully.' };
  }
}
