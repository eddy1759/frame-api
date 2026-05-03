import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { User } from '../../auth/entities/user.entity';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { OptionalJwtGuard } from '../../auth/guards/optional-jwt.guard';
import { AddAlbumImageDto } from '../dto/add-album-image.dto';
import { CheckAlbumShortCodeAvailabilityDto } from '../dto/check-album-shortcode-availability.dto';
import { CreateAlbumDto } from '../dto/create-album.dto';
import { QueryAlbumImagesDto } from '../dto/query-album-images.dto';
import { QueryAlbumsDto } from '../dto/query-albums.dto';
import { UpdateAlbumDto } from '../dto/update-album.dto';
import { AlbumIngestionService } from '../services/album.ingestion.service';
import { AlbumQueryService } from '../services/album.query.service';
import { AlbumService } from '../services/album.service';

@ApiTags('Albums')
@Controller('albums')
export class AlbumsController {
  constructor(
    private readonly albumService: AlbumService,
    private readonly albumQueryService: AlbumQueryService,
    private readonly albumIngestionService: AlbumIngestionService,
  ) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new album for the authenticated user.' })
  @ApiResponse({ status: 201, description: 'Album created.' })
  async createAlbum(@CurrentUser() user: User, @Body() dto: CreateAlbumDto) {
    return this.albumService.createAlbum(user, dto);
  }

  @Get('shortcodes/availability')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Check whether a personalized album short code is available.',
  })
  @ApiResponse({
    status: 200,
    description: 'Short code availability returned.',
  })
  async checkShortCodeAvailability(
    @Query() query: CheckAlbumShortCodeAvailabilityDto,
  ) {
    return this.albumService.checkShortCodeAvailability(query);
  }

  @Patch(':id([0-9a-fA-F-]{36})')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update the authenticated owner album metadata and short code.',
  })
  @ApiParam({ name: 'id', description: 'Album ID' })
  @ApiResponse({ status: 200, description: 'Album updated.' })
  async updateAlbum(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlbumDto,
  ) {
    return this.albumService.updateAlbum(user, id, dto);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('search')
  @ApiOperation({
    summary:
      'Search albums. Authenticated owners can also see their own private and empty albums.',
  })
  @ApiResponse({ status: 200, description: 'Albums returned.' })
  async searchAlbums(
    @CurrentUser() user: User | undefined,
    @Query() query: QueryAlbumsDto,
  ) {
    return this.albumQueryService.searchAlbums(query, user);
  }

  @UseGuards(AdminGuard)
  @Post(':id([0-9a-fA-F-]{36})/images')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Replay or recover album image ingestion for an existing image.',
  })
  @ApiParam({ name: 'id', description: 'Album ID' })
  @ApiResponse({ status: 201, description: 'Album image replay processed.' })
  async addAlbumImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAlbumImageDto,
  ) {
    return this.albumIngestionService.replayAlbumImage(id, dto);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':id([0-9a-fA-F-]{36})/images')
  @ApiOperation({
    summary: 'List album images for a public album or the authenticated owner.',
  })
  @ApiParam({ name: 'id', description: 'Album ID' })
  @ApiResponse({ status: 200, description: 'Album images returned.' })
  async getAlbumImages(
    @CurrentUser() user: User | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryAlbumImagesDto,
  ) {
    return this.albumQueryService.listAlbumImages(id, query, user);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':id([0-9a-fA-F-]{36})/images/:imageId([0-9a-fA-F-]{36})')
  @ApiOperation({
    summary:
      'Get a read-only album-scoped image detail for a public album or the authenticated owner.',
  })
  @ApiParam({ name: 'id', description: 'Album ID' })
  @ApiParam({ name: 'imageId', description: 'Image ID' })
  @ApiResponse({ status: 200, description: 'Album image detail returned.' })
  @ApiResponse({ status: 404, description: 'Album image not found.' })
  async getAlbumImageDetail(
    @CurrentUser() user: User | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.albumQueryService.getAlbumImageDetail(id, imageId, user);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':shortCode')
  @ApiOperation({
    summary:
      'Get album detail by short code. Public albums are open to everyone; private albums are owner-only.',
  })
  @ApiParam({
    name: 'shortCode',
    description: 'Album short code (legacy or personalized)',
  })
  @ApiResponse({ status: 200, description: 'Album detail returned.' })
  async getAlbumDetail(
    @CurrentUser() user: User | undefined,
    @Param('shortCode') shortCode: string,
  ) {
    const detail = await this.albumQueryService.getAlbumDetail(shortCode, user);
    if (detail.isPublic === true && typeof detail.id === 'string') {
      await this.albumService.queueAnalyticsUpdate(detail.id, 'view');
    }
    return detail;
  }
}
