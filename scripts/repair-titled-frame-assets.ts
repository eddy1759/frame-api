/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { Frame } from '../src/frames/entities/frame.entity';
import { FrameAsset } from '../src/frames/entities/frame-asset.entity';
import { FrameAssetType } from '../src/frames/entities/frame-asset-type.enum';
import { FrameAssetsService } from '../src/frames/services/frame-assets.service';
import { StoragePort, STORAGE_PORT } from '../src/common/services';
import { Image } from '../src/images/entities/image.entity';
import { ImageCompositingService } from '../src/images/services/image-compositing.service';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const frameRepository = dataSource.getRepository(Frame);
    const frameAssetRepository = dataSource.getRepository(FrameAsset);
    const imageRepository = dataSource.getRepository(Image);
    const frameAssetsService = app.get(FrameAssetsService);
    const imageCompositingService = app.get(ImageCompositingService);
    const storageService = app.get<StoragePort>(STORAGE_PORT);

    const titledFrames = await frameRepository.find({
      where: {
        isActive: true,
      },
      select: [
        'id',
        'slug',
        'name',
        'metadata',
        'width',
        'height',
        'aspectRatio',
        'orientation',
        'svgUrl',
        'thumbnailUrl',
        'editorPreviewUrl',
      ],
    });

    const repairedFrameIds: string[] = [];

    for (const frame of titledFrames) {
      if (!frame.metadata || !('titleConfig' in frame.metadata)) {
        continue;
      }

      const svgAsset = await frameAssetRepository.findOne({
        where: {
          frameId: frame.id,
          type: FrameAssetType.SVG,
        },
      });
      if (!svgAsset) {
        console.warn(`Skipping ${frame.slug}: SVG asset not found.`);
        continue;
      }

      const svgBuffer = await storageService.getObjectBuffer(
        svgAsset.storageKey,
      );
      await frameAssetsService.uploadSvgAsset(frame.id, {
        buffer: svgBuffer,
        size: svgBuffer.byteLength,
        mimetype: 'image/svg+xml',
        originalname: `${frame.slug}.svg`,
      });
      repairedFrameIds.push(frame.id);
      console.log(`Re-rendered titled frame assets for ${frame.slug}`);
    }

    if (repairedFrameIds.length === 0) {
      console.log('No titled frames required repair.');
      return;
    }

    const images = await imageRepository.find({
      where: { frameId: In(repairedFrameIds) },
      select: ['id', 'userId'],
    });

    for (const image of images) {
      await imageCompositingService.requestReprocess(image.id, {
        id: image.userId,
        role: UserRole.ADMIN,
      });
      console.log(`Queued image reprocess for ${image.id}`);
    }
  } finally {
    await app.close();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Failed to repair titled frame assets.', error);
    process.exit(1);
  });
