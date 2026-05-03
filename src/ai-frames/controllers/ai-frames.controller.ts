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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import type { PaginatedResult } from '../../common/services';
import {
  AcceptIterationDto,
  GenerateAiFrameDto,
  QueryAiFrameJobsDto,
  RegenerateDto,
  UpdateAiFrameMetadataDto,
} from '../dto';
import { AiFrameService } from '../services/ai-frame.service';
import { AiFrameQueryService } from '../services/ai-frame-query.service';
import { AiFrameIterationGuard, AiFrameOwnerGuard } from '../guards';

@ApiTags('AI Frames')
@ApiBearerAuth('JWT-auth')
@Controller('ai-frames')
@UseGuards(JwtAuthGuard)
export class AiFramesController {
  constructor(
    private readonly aiFrameService: AiFrameService,
    private readonly aiFrameQueryService: AiFrameQueryService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create an AI frame generation job' })
  @ApiResponse({ status: 202, description: 'AI frame job accepted.' })
  async generate(
    @CurrentUser() user: User,
    @Body() dto: GenerateAiFrameDto,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.generate(user, dto);
  }

  @Post('jobs/:jobId/regenerate')
  @UseGuards(AiFrameOwnerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create a new iteration for an AI frame job' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async regenerate(
    @CurrentUser() user: User,
    @Param('jobId') jobId: string,
    @Body() dto: RegenerateDto,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.regenerate(user, jobId, dto);
  }

  @Post('jobs/:jobId/accept')
  @UseGuards(AiFrameOwnerGuard, AiFrameIterationGuard)
  @ApiOperation({ summary: 'Accept a completed AI frame iteration' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async accept(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @Body() dto: AcceptIterationDto,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.accept(userId, jobId, dto);
  }

  @Get('jobs/:jobId/status')
  @UseGuards(AiFrameOwnerGuard)
  @ApiOperation({ summary: 'Get AI frame job processing status' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async status(
    @Param('jobId') jobId: string,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameQueryService.getJobStatus(jobId);
  }

  @Get('jobs/:jobId/result')
  @UseGuards(AiFrameOwnerGuard)
  @ApiOperation({ summary: 'Get the current AI frame result payload' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async result(
    @Param('jobId') jobId: string,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameQueryService.getJobResult(jobId);
  }

  @Get('jobs/:jobId/iterations')
  @UseGuards(AiFrameOwnerGuard)
  @ApiOperation({ summary: 'List iterations for an AI frame job' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async iterations(
    @Param('jobId') jobId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.aiFrameQueryService.listJobIterations(jobId);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List AI frame jobs for the authenticated user' })
  async listJobs(
    @CurrentUser('id') userId: string,
    @Query() query: QueryAiFrameJobsDto,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    return this.aiFrameQueryService.listJobs(userId, query);
  }

  @Post('jobs/:jobId/cancel')
  @UseGuards(AiFrameOwnerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request cancellation for an AI frame job' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async cancel(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.cancel(userId, jobId);
  }

  @Patch('jobs/:jobId/metadata')
  @UseGuards(AiFrameOwnerGuard)
  @ApiOperation({ summary: 'Update the generated frame metadata for a job' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async updateMetadata(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateAiFrameMetadataDto,
  ): Promise<Record<string, unknown>> {
    return this.aiFrameService.updateMetadata(userId, jobId, dto);
  }

  @Delete('jobs/:jobId')
  @UseGuards(AiFrameOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an AI frame job and private assets' })
  @ApiParam({ name: 'jobId', description: 'AI frame job ID' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
  ): Promise<void> {
    await this.aiFrameService.softDelete(userId, jobId);
  }
}
