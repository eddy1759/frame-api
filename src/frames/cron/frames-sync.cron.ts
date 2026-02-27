import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Frame } from '../entities/frame.entity';
import { CacheService } from '../../common/services';
import { FramesCacheService } from '../services/frames-cache.service';

@Injectable()
export class FramesSyncCron {
  private readonly logger = new Logger(FramesSyncCron.name);

  constructor(
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    private readonly cacheService: CacheService,
    private readonly framesCacheService: FramesCacheService,
  ) {}

  @Cron('0 */15 * * * *')
  async syncPopularity(): Promise<void> {
    const viewScores = await this.cacheService.zRangeWithScores('popular:frames:views');
    const applyScores = await this.cacheService.zRangeWithScores('popular:frames:applies');

    let updatedRows = 0;
    let totalViews = 0;
    let totalApplies = 0;

    for (const entry of viewScores) {
      const increment = Math.max(0, Math.floor(entry.score));
      if (increment === 0) continue;
      await this.frameRepository.increment({ id: entry.member }, 'viewCount', increment);
      updatedRows += 1;
      totalViews += increment;
    }

    for (const entry of applyScores) {
      const increment = Math.max(0, Math.floor(entry.score));
      if (increment === 0) continue;
      await this.frameRepository.increment({ id: entry.member }, 'applyCount', increment);
      updatedRows += 1;
      totalApplies += increment;
    }

    if (viewScores.length > 0) {
      await this.cacheService.del('popular:frames:views');
    }
    if (applyScores.length > 0) {
      await this.cacheService.del('popular:frames:applies');
    }

    if (updatedRows > 0) {
      await this.framesCacheService.invalidatePopular();
      this.logger.log(
        `Popularity sync complete: rows=${updatedRows}, views=${totalViews}, applies=${totalApplies}`,
      );
    }
  }
}


