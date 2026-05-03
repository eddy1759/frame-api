import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { FramesService } from '../services/frames.service';
import { QueryCategoriesDto } from '../dto/query-taxonomy.dto';

@ApiTags('Frames Categories')
@Controller('frames/categories')
export class CategoriesController {
  constructor(private readonly framesService: FramesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active categories' })
  @ApiResponse({ status: 200, description: 'Categories returned' })
  async list(@Query() query: QueryCategoriesDto): Promise<unknown> {
    return this.framesService.listCategories(query.includeEmpty ?? false);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiResponse({ status: 200, description: 'Category returned' })
  async getBySlug(@Param('slug') slug: string): Promise<unknown> {
    return this.framesService.getCategoryBySlug(slug);
  }
}
