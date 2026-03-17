import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageVariant } from '../entities/image-variant.entity';
import { VariantType } from '../types/image.types';
import { StorageService } from '../../common/services/storage.service';

@Injectable()
export class ImageVariantService {
  private readonly logger = new Logger(ImageVariantService.name);

  constructor(
    @InjectRepository(ImageVariant)
    private readonly variantRepository: Repository<ImageVariant>,
    private readonly storageService: StorageService,
  ) {}

  async createVariant(data: {
    imageId: string;
    variantType: VariantType;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    quality?: number;
  }): Promise<ImageVariant> {
    const cdnUrl = this.storageService.getPublicUrl(data.storageKey);

    const variant = this.variantRepository.create({
      ...data,
      cdnUrl,
    });

    return this.variantRepository.save(variant);
  }

  async getVariantsByImageId(imageId: string): Promise<ImageVariant[]> {
    return this.variantRepository.find({
      where: { imageId },
      order: { variantType: 'ASC' },
    });
  }

  async getVariantsByImageIds(
    imageIds: string[],
  ): Promise<Map<string, ImageVariant[]>> {
    if (imageIds.length === 0) return new Map();

    const variants = await this.variantRepository
      .createQueryBuilder('v')
      .where('v.imageId IN (:...imageIds)', { imageIds })
      .orderBy('v.variantType', 'ASC')
      .getMany();

    const map = new Map<string, ImageVariant[]>();
    for (const variant of variants) {
      if (!map.has(variant.imageId)) {
        map.set(variant.imageId, []);
      }
      map.get(variant?.imageId)?.push(variant);
    }

    return map;
  }

  async deleteVariantsByImageId(
    imageId: string,
  ): Promise<{ storageKeys: string[]; totalBytes: number }> {
    const variants = await this.variantRepository.find({ where: { imageId } });

    const storageKeys = variants.map((v) => v.storageKey);
    const totalBytes = variants.reduce((sum, v) => sum + Number(v.fileSize), 0);

    if (variants.length > 0) {
      await this.variantRepository.delete({ imageId });
    }

    return { storageKeys, totalBytes };
  }

  async existsForImage(
    imageId: string,
    variantType: VariantType,
  ): Promise<boolean> {
    const count = await this.variantRepository.count({
      where: { imageId, variantType },
    });
    return count > 0;
  }

  formatVariantsForResponse(variants: ImageVariant[]): Record<
    string,
    {
      cdnUrl: string;
      width: number;
      height: number;
      fileSize: number;
      mimeType: string;
    }
  > {
    const result: Record<string, any> = {};

    for (const variant of variants) {
      result[variant.variantType] = {
        cdnUrl: variant.cdnUrl,
        width: variant.width,
        height: variant.height,
        fileSize: Number(variant.fileSize),
        mimeType: variant.mimeType,
      };
    }

    return result;
  }
}
