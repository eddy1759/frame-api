import { Global, Module } from '@nestjs/common';
import {
  CacheService,
  PaginationService,
  SlugService,
  StorageService,
} from './services';

@Global()
@Module({
  providers: [CacheService, PaginationService, SlugService, StorageService],
  exports: [CacheService, PaginationService, SlugService, StorageService],
})
export class SharedModule {}
