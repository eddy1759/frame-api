import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import type { PaginatedResult } from '../../common/services';
import {
  AdminQueryAiFrameJobsDto,
  GenerateAiFrameDto,
  UpdateScenePlacementDto,
} from '../dto';
import { AiFrameAdminGuard } from '../guards';
import { AiFrameService } from '../services/ai-frame.service';
import { AiFrameQueryService } from '../services/ai-frame-query.service';

@ApiTags('AI Frames Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/ai-frames')
@UseGuards(JwtAuthGuard, AiFrameAdminGuard)
export class AiFramesAdminController {
  constructor(
    private readonly aiFrameService: AiFrameService,
    private readonly aiFrameQueryService: AiFrameQueryService,
  ) {}

  @Get('jobs')
  @ApiOperation({ summary: 'List AI frame jobs across users' })
  async listJobs(
    @Query() query: AdminQueryAiFrameJobsDto,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    return this.aiFrameQueryService.listAdminJobs(query);
  }

  @Post('generate-scene')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Generate an admin-only photorealistic scene frame',
  })
  async generateScene(
    @CurrentUser() user: User,
    @Body() dto: GenerateAiFrameDto,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.generateScene(user, dto);
  }

  @Patch('jobs/:jobId/scene-placement')
  @ApiOperation({
    summary:
      'Annotate a scene AI frame with the printable quadrilateral placement',
  })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async updateScenePlacement(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateScenePlacementDto,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.updateScenePlacement(jobId, dto);
  }

  @Post('jobs/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry a failed AI frame job iteration' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async retry(@Param('jobId') jobId: string): Promise<Record<string, unknown>> {
    return this.aiFrameService.retryAsAdmin(jobId);
  }

  @Post('jobs/:jobId/promote')
  @ApiOperation({
    summary: 'Promote an accepted private AI frame into the public catalog',
  })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async promote(
    @CurrentUser() user: User,
    @Param('jobId') jobId: string,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.promote(jobId, user.id);
  }

  @Delete('jobs/:jobId/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete an AI frame job and all assets' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async hardDelete(@Param('jobId') jobId: string): Promise<void> {
    await this.aiFrameService.hardDelete(jobId);
  }
}
