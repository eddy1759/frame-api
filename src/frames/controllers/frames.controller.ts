import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { User } from '../../auth/entities/user.entity';
import { AuthThrottleGuard } from '../../auth/guards/custom-throttle.guard';
import { CustomizeFrameDto } from '../dto/customize-frame.dto';
import {
  QueryFramesDto,
  QueryPopularFramesDto,
  QuerySavedFramesDto,
} from '../dto/query-frames.dto';
import { QueryTagsDto } from '../dto/query-taxonomy.dto';
import { FramesService } from '../services/frames.service';
import { OptionalJwtGuard } from '../../auth/guards/optional-jwt.guard';
import { PremiumFrameGuard } from '../guards/premium-frame.guard';

@ApiTags('Frames')
@Controller('frames')
export class FramesController {
  constructor(
    private readonly framesService: FramesService,
    private readonly throttleGuard: AuthThrottleGuard,
  ) {}

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get()
  @ApiOperation({ summary: 'Browse frames with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Frames returned' })
  async list(
    @Query() query: QueryFramesDto,
    @CurrentUser() user: User | null,
  ): Promise<unknown> {
    return this.framesService.listFrames(query, user?.id);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('popular')
  @ApiOperation({ summary: 'Get popular frames' })
  @ApiResponse({ status: 200, description: 'Popular frames returned' })
  async popular(
    @Query() query: QueryPopularFramesDto,
    @CurrentUser() user: User | null,
  ): Promise<unknown> {
    return this.framesService.getPopular(query.limit, user?.id);
  }

  @Get('saved')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user saved frames' })
  @ApiResponse({ status: 200, description: 'Saved frames returned' })
  async saved(
    @CurrentUser() user: User,
    @Query() query: QuerySavedFramesDto,
  ): Promise<unknown> {
    return this.framesService.getSavedFrames(user.id, query.page, query.limit);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get frame detail by slug' })
  @ApiParam({ name: 'slug', description: 'Frame slug' })
  @ApiResponse({ status: 200, description: 'Frame returned' })
  async detailBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user: User | null,
  ): Promise<unknown> {
    return this.framesService.getFrameBySlug(slug, user);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('tags')
  @ApiOperation({ summary: 'List available tags' })
  @ApiResponse({ status: 200, description: 'Tags returned' })
  async tags(@Query() query: QueryTagsDto): Promise<unknown> {
    return this.framesService.listTags(query.limit, query.search);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':id([0-9a-fA-F-]{36})')
  @ApiOperation({ summary: 'Get frame detail by ID' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 200, description: 'Frame returned' })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User | null,
  ): Promise<unknown> {
    return this.framesService.getFrameById(id, user);
  }

  @Public()
  @UseGuards(OptionalJwtGuard, PremiumFrameGuard)
  @Get(':id([0-9a-fA-F-]{36})/svg')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get frame SVG CDN URL' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 200, description: 'SVG URL returned' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized for premium frame access',
  })
  @ApiResponse({ status: 403, description: 'Premium subscription required' })
  async svg(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User | null,
  ): Promise<unknown> {
    return this.framesService.getFrameSvgUrl(id, user);
  }

  @Public()
  @UseGuards(OptionalJwtGuard, PremiumFrameGuard)
  @Get(':id([0-9a-fA-F-]{36})/editor-preview')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get frame editor preview PNG URL' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 200, description: 'Editor preview URL returned' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized for premium frame preview access',
  })
  @ApiResponse({ status: 403, description: 'Premium subscription required' })
  async editorPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User | null,
  ): Promise<unknown> {
    return this.framesService.getFrameEditorPreviewUrl(id, user);
  }

  @Post(':id([0-9a-fA-F-]{36})/customize')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a personalized private copy of a frame' })
  @ApiParam({ name: 'id', description: 'Source frame ID' })
  @ApiResponse({
    status: 201,
    description: 'Personalized private frame created successfully',
  })
  async customize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CustomizeFrameDto,
  ): Promise<unknown> {
    return this.framesService.customizeFrame(id, user, dto);
  }

  @Post(':id([0-9a-fA-F-]{36})/apply')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Record frame apply event' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 201, description: 'Apply recorded' })
  async apply(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 120,
      ttlSeconds: 60,
    });
    await this.framesService.recordApply(id);
    return { message: 'Apply event recorded.' };
  }

  @Post(':id([0-9a-fA-F-]{36})/save')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Save frame to user collection' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 201, description: 'Frame saved' })
  async save(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    await this.framesService.saveFrame(id, user.id);
    return { message: 'Frame saved successfully.' };
  }

  @Delete(':id([0-9a-fA-F-]{36})/save')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove frame from user collection' })
  @ApiParam({ name: 'id', description: 'Frame ID' })
  @ApiResponse({ status: 200, description: 'Frame unsaved' })
  async unsave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    await this.framesService.unsaveFrame(id, user.id);
    return { message: 'Frame removed from saved collection.' };
  }
}
