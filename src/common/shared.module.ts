import { Global, Module } from '@nestjs/common';
import {
  CacheService,
  PaginationService,
  SlugService,
  StorageService,
} from './services';
import { STORAGE_PORT } from './services/storage/storage.tokens';

@Global()
@Module({
  providers: [
    CacheService,
    PaginationService,
    SlugService,
    StorageService,
    {
      provide: STORAGE_PORT,
      useExisting: StorageService,
    },
  ],
  exports: [
    CacheService,
    PaginationService,
    SlugService,
    StorageService,
    STORAGE_PORT,
  ],
})
export class SharedModule {}
