import {
  Body,
  Controller,
  Get,
  Param,
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
import { CreateAlbumDto } from '../dto/create-album.dto';
import { QueryAlbumImagesDto } from '../dto/query-album-images.dto';
import { QueryAlbumsDto } from '../dto/query-albums.dto';
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
  @ApiOperation({ summary: 'Create or return the authenticated owner album.' })
  @ApiResponse({ status: 201, description: 'Album created or returned.' })
  async createAlbum(@CurrentUser() user: User, @Body() dto: CreateAlbumDto) {
    return this.albumService.createAlbum(user, dto);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('search')
  @ApiOperation({ summary: 'Search public albums.' })
  @ApiResponse({ status: 200, description: 'Albums returned.' })
  async searchAlbums(@Query() query: QueryAlbumsDto) {
    return this.albumQueryService.searchAlbums(query);
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
  @ApiOperation({ summary: 'List public album images.' })
  @ApiParam({ name: 'id', description: 'Album ID' })
  @ApiResponse({ status: 200, description: 'Album images returned.' })
  async getAlbumImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryAlbumImagesDto,
  ) {
    return this.albumQueryService.listAlbumImages(id, query);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':shortCode([1-9A-HJ-NP-Za-km-z]{8})')
  @ApiOperation({ summary: 'Get public album detail by short code.' })
  @ApiParam({ name: 'shortCode', description: 'Album short code' })
  @ApiResponse({ status: 200, description: 'Album detail returned.' })
  async getAlbumDetail(@Param('shortCode') shortCode: string) {
    const detail = await this.albumQueryService.getAlbumDetail(shortCode);
    if (typeof detail.id === 'string') {
      await this.albumService.queueAnalyticsUpdate(detail.id, 'view');
    }
    return detail;
  }
}
