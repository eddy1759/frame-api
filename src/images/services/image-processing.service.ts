/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Image } from '../entities/image.entity';
import { ProcessingStatus } from '../types/image.types';
import { ImagesCacheService } from './images-cache.service';
import {
  IMAGE_PROCESSING_QUEUE,
  ImageProcessingJobType,
  ImageProcessingJobData,
} from '../../common/queue/queue.constants';

export interface ImageProcessingStatusResult {
  imageId: string;
  processingStatus: string;
  variants: string[];
  completedAt: Date | null;
}

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectQueue(IMAGE_PROCESSING_QUEUE)
    private readonly processingQueue: Queue,
    private readonly imagesCacheService: ImagesCacheService,
  ) {}

  async getProcessingStatus(
    imageId: string,
    userId: string,
  ): Promise<ImageProcessingStatusResult | null> {
    // Try cache first
    const cached = (await this.imagesCacheService.getProcessingStatus(
      imageId,
    )) as ImageProcessingStatusResult | null;
    if (cached) {
      return cached;
    }

    const image = await this.imageRepository.findOne({
      where: { id: imageId },
      select: ['id', 'userId', 'processingStatus', 'updatedAt'],
      relations: ['variants'],
    });

    if (!image) {
      return null;
    }

    if (image.userId !== userId) {
      return null;
    }

    const result = {
      imageId: image.id,
      processingStatus: image.processingStatus,
      variants: image.variants?.map((v) => v.variantType) || [],
      completedAt:
        image.processingStatus === ProcessingStatus.COMPLETED
          ? image.updatedAt
          : null,
    };

    await this.imagesCacheService.setProcessingStatus(imageId, result);

    return result;
  }

  async reprocessImage(imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      throw new Error(`Image not found: ${imageId}`);
    }

    await this.imageRepository.update(imageId, {
      processingStatus: ProcessingStatus.PENDING,
      processingError: null,
    });

    const jobData: ImageProcessingJobData = {
      imageId: image.id,
      userId: image.userId,
      tmpStorageKey: image.storageKey,
      storageKey: image.storageKey,
      mimeType: image.mimeType,
      is360: image.is360,
      requestedAt: new Date().toISOString(),
    };

    await this.processingQueue.add(
      ImageProcessingJobType.REPROCESS_IMAGE,
      jobData,
      { jobId: `reprocess-${image.id}-${Date.now()}` },
    );

    await this.imagesCacheService.invalidateImage(imageId);

    this.logger.log(`Reprocessing triggered for image ${imageId}`);
  }
}
