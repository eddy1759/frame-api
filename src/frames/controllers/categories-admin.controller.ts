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
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { AdminGuard } from '../../auth/guards/admin.guard';

@ApiTags('Frames Admin Categories')
@ApiBearerAuth('JWT-auth')
@UseGuards(AdminGuard)
@Controller('admin/frames/categories')
export class CategoriesAdminController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly throttleGuard: AuthThrottleGuard,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async create(
    @Body() dto: CreateCategoryDto,
    @Req() req: Request,
  ): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    return this.categoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active categories (admin)' })
  @ApiResponse({ status: 200, description: 'Categories returned' })
  async list(): Promise<unknown> {
    return this.categoriesService.listActive(true);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() req: Request,
  ): Promise<unknown> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 60,
      ttlSeconds: 60,
    });
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 30,
      ttlSeconds: 60,
    });
    await this.categoriesService.remove(id);
    return { message: 'Category deleted successfully.' };
  }
}
