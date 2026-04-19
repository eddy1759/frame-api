import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../common/filters/business.exception';
import { AlbumImageAddedJobData } from '../../common/queue/queue.constants';
import { Image } from '../../images/entities/image.entity';
import { ImageRenderVariant } from '../../images/entities/image-render-variant.entity';
import { VariantType } from '../../images/types/image.types';
import { AddAlbumImageDto } from '../dto/add-album-image.dto';
import { AlbumItem } from '../entities/album-item.entity';
import { Album } from '../entities/album.entity';

@Injectable()
export class AlbumIngestionService {
  constructor(
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectRepository(AlbumItem)
    private readonly albumItemRepository: Repository<AlbumItem>,
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectRepository(ImageRenderVariant)
    private readonly imageRenderVariantRepository: Repository<ImageRenderVariant>,
  ) {}

  async ingestImage(
    data: AlbumImageAddedJobData,
  ): Promise<{ album: Album; inserted: boolean }> {
    const album = await this.albumRepository.findOne({
      where: { id: data.albumId },
      select: ['id', 'shortCode', 'frameId', 'isPublic'],
    });

    if (!album) {
      throw new BusinessException(
        'ALBUM_NOT_FOUND',
        'Album not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const image = await this.imageRepository.findOne({
      where: {
        id: data.imageId,
        isDeleted: false,
      },
      select: ['id', 'albumId', 'frameId', 'userId', 'activeRenderRevision'],
    });

    if (!image) {
      throw new BusinessException(
        'IMAGE_NOT_FOUND',
        'Image not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (image.albumId !== album.id) {
      throw new BusinessException(
        'ALBUM_IMAGE_MISMATCH',
        'Image is not associated with the target album.',
        HttpStatus.CONFLICT,
      );
    }

    if (!image.frameId || image.frameId !== album.frameId) {
      throw new BusinessException(
        'ALBUM_FRAME_MISMATCH',
        'Image frame does not match the album frame.',
        HttpStatus.CONFLICT,
      );
    }

    if (image.userId !== data.userId || image.frameId !== data.frameId) {
      throw new BusinessException(
        'ALBUM_IMAGE_MISMATCH',
        'Image metadata does not match the ingestion payload.',
        HttpStatus.CONFLICT,
      );
    }

    const renderVariantCount = await this.imageRenderVariantRepository.count({
      where: {
        imageId: data.imageId,
        renderRevision: data.imageRenderRevision,
        variantType: In([VariantType.THUMBNAIL, VariantType.MEDIUM]),
      },
    });

    if (renderVariantCount === 0) {
      throw new BusinessException(
        'ALBUM_RENDER_VARIANTS_NOT_READY',
        'Framed render variants are not ready for album ingestion.',
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.albumItemRepository.findOne({
      where: {
        albumId: data.albumId,
        imageId: data.imageId,
      },
      select: ['id'],
    });

    if (existing) {
      return { album, inserted: false };
    }

    try {
      const item = this.albumItemRepository.create({
        albumId: album.id,
        imageId: data.imageId,
        frameId: data.frameId,
        userId: data.userId,
        imageRenderRevision: data.imageRenderRevision,
      });

      await this.albumItemRepository.save(item);
      return { album, inserted: true };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { album, inserted: false };
      }

      throw error;
    }
  }

  async replayAlbumImage(
    albumId: string,
    dto: AddAlbumImageDto,
  ): Promise<{ albumId: string; imageId: string; inserted: boolean }> {
    const image = await this.imageRepository.findOne({
      where: {
        id: dto.imageId,
        isDeleted: false,
      },
      select: ['id', 'userId', 'frameId', 'activeRenderRevision'],
    });

    if (!image?.frameId || image.activeRenderRevision < 1) {
      throw new BusinessException(
        'ALBUM_IMAGE_NOT_READY',
        'Image is not ready for album ingestion replay.',
        HttpStatus.CONFLICT,
      );
    }

    const result = await this.ingestImage({
      albumId,
      imageId: image.id,
      frameId: image.frameId,
      userId: image.userId,
      imageRenderRevision: image.activeRenderRevision,
    });

    return {
      albumId,
      imageId: image.id,
      inserted: result.inserted,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'constraint' in error &&
      (error as { code?: string }).code === '23505' &&
      (error as { constraint?: string }).constraint ===
        'idx_album_item_album_image'
    );
  }
}
