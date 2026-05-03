import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { In, DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { Frame } from '../src/frames/entities/frame.entity';
import { FrameAssetsService } from '../src/frames/services/frame-assets.service';
import { Image } from '../src/images/entities/image.entity';
import { ImageCompositingService } from '../src/images/services/image-compositing.service';
import {
  CATEGORY_FRAME_SPECS,
  DEFAULT_SAMPLE_DIR,
  writeCategoryFrameSvgFiles,
} from './frame-svg-generator';

function run(): Promise<void> {
  writeSampleFiles();
  return syncLocalAssets();
}

function writeSampleFiles(): void {
  const written = writeCategoryFrameSvgFiles();
  for (const { spec } of written) {
    console.log(`Wrote ${spec.fileName}`);
  }
}

async function syncLocalAssets(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const frameRepository = dataSource.getRepository(Frame);
    const imageRepository = dataSource.getRepository(Image);
    const frameAssetsService = app.get(FrameAssetsService);
    const imageCompositingService = app.get(ImageCompositingService);
    const repairedFrameIds: string[] = [];

    for (const spec of CATEGORY_FRAME_SPECS) {
      const frame = await frameRepository.findOne({
        where: { slug: spec.slug },
      });

      if (!frame) {
        console.warn(`Skipping ${spec.slug}: frame not found.`);
        continue;
      }

      frame.metadata = {
        ...(frame.metadata ?? {}),
        imagePlacement: {
          version: 1,
          fit: 'cover',
          window: spec.placement,
        },
      };
      await frameRepository.save(frame);

      const buffer = readFileSync(join(DEFAULT_SAMPLE_DIR, spec.fileName));
      await frameAssetsService.uploadSvgAsset(frame.id, {
        buffer,
        size: buffer.byteLength,
        mimetype: 'image/svg+xml',
        originalname: spec.fileName,
      });

      repairedFrameIds.push(frame.id);
      console.log(`Uploaded sample assets for ${spec.slug}`);
    }

    if (repairedFrameIds.length === 0) {
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
      console.log(`Refreshed frame snapshot for image ${image.id}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  console.error('Failed to repair sample frame assets.', error);
  process.exit(1);
});
