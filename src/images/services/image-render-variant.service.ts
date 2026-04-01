import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ImageRenderVariant } from '../entities/image-render-variant.entity';
import { VariantType } from '../types/image.types';
import { StorageService } from '../../common/services/storage.service';

@Injectable()
export class ImageRenderVariantService {
  private readonly logger = new Logger(ImageRenderVariantService.name);

  constructor(
    @InjectRepository(ImageRenderVariant)
    private readonly renderVariantRepository: Repository<ImageRenderVariant>,
    private readonly storageService: StorageService,
  ) {}

  async createRenderVariant(data: {
    imageId: string;
    renderRevision: number;
    variantType: VariantType;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    quality?: number;
  }): Promise<{ variant: ImageRenderVariant; created: boolean }> {
    const existing = await this.renderVariantRepository.findOne({
      where: {
        imageId: data.imageId,
        renderRevision: data.renderRevision,
        variantType: data.variantType,
      },
    });

    const variant = this.renderVariantRepository.create({
      ...(existing ?? {}),
      ...data,
      cdnUrl: this.storageService.getPublicUrl(data.storageKey),
      quality: data.quality ?? null,
    });

    return {
      variant: await this.renderVariantRepository.save(variant),
      created: !existing,
    };
  }

  async getRenderVariant(
    imageId: string,
    renderRevision: number,
    variantType: VariantType,
  ): Promise<ImageRenderVariant | null> {
    return this.renderVariantRepository.findOne({
      where: {
        imageId,
        renderRevision,
        variantType,
      },
    });
  }

  async getRenderVariantsByImageRevision(
    imageId: string,
    renderRevision: number,
  ): Promise<ImageRenderVariant[]> {
    return this.renderVariantRepository.find({
      where: {
        imageId,
        renderRevision,
      },
      order: { variantType: 'ASC' },
    });
  }

  async getRenderVariantsByImageId(
    imageId: string,
  ): Promise<ImageRenderVariant[]> {
    return this.renderVariantRepository.find({
      where: { imageId },
      order: {
        renderRevision: 'ASC',
        variantType: 'ASC',
      },
    });
  }

  async deleteRenderVariantsByImageId(
    imageId: string,
  ): Promise<{ storageKeys: string[]; totalBytes: number }> {
    const variants = await this.renderVariantRepository.find({
      where: { imageId },
    });

    return this.deleteVariants(variants);
  }

  async deleteRenderVariantsOlderThanRevision(
    imageId: string,
    activeRenderRevision: number,
  ): Promise<{ storageKeys: string[]; totalBytes: number; count: number }> {
    const variants = await this.renderVariantRepository.find({
      where: {
        imageId,
        renderRevision: LessThan(activeRenderRevision),
      },
    });

    const deleted = await this.deleteVariants(variants);
    return {
      ...deleted,
      count: variants.length,
    };
  }

  private async deleteVariants(
    variants: ImageRenderVariant[],
  ): Promise<{ storageKeys: string[]; totalBytes: number }> {
    const storageKeys = variants.map((variant) => variant.storageKey);
    const totalBytes = variants.reduce(
      (sum, variant) => sum + Number(variant.fileSize),
      0,
    );

    if (variants.length > 0) {
      await this.renderVariantRepository.delete(
        variants.map((variant) => variant.id),
      );
      this.logger.log(`Deleted ${variants.length} render variant records`);
    }

    return { storageKeys, totalBytes };
  }
}
