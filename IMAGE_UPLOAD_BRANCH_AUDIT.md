# `feat/image-upload` Branch Audit

Audit date: 2026-03-18

Branch under review: `feat/image-upload`

Base branch used for comparison: `main`

Diff basis:

- `git merge-base main feat/image-upload` -> `2ef56ec3a48afa571f43bb0d1730e4d20f15fcca`
- `git diff --name-status main...feat/image-upload`
- `git log --oneline main..feat/image-upload`

Scope note:

- This report starts from the committed `main...feat/image-upload` diff and also includes the current branch worktree files the user identified as part of the feature.
- In-scope worktree files added beyond the committed diff include:
  - `src/images/controllers/*`
  - `src/images/services/images.service.ts`
  - `src/images/services/image-processing.service.ts`
  - `src/images/workers/*`
  - `src/images/guards/image-owner.guard.ts`
  - `src/database/migrations/1773741400000-create-image-table.ts`

## Remediation Status Update (2026-03-18)

This branch should be treated as the backend image-upload subsystem and its sync points with the wider system, not as a standalone file-upload patch. The current worktree now integrates image upload with auth/JWT claims, premium frame eligibility, private storage, queues, quota accounting, cleanup, and cache invalidation.

Implemented after the original audit baseline:

- fixed queue/image config wiring and the image-module compile-time blockers
- replaced the draft image migration with entity-aligned schema plus `users.subscription_active`, `user_storage_quotas.pending_bytes`, and `UploadSessionStatus.COMPLETING`
- reworked upload completion, worker processing, cleanup, and privacy behavior into a private-image pipeline
- implemented snapshot-based frame compositing with read-through render caching via `ImageCompositingService`, `image_render_variants`, and revisioned frame snapshot state on `images`
- added owner/admin reprocess flows so staged frame changes are promoted intentionally instead of mutating visual output immediately
- added Swagger coverage for image upload/session/admin endpoints and image request DTOs
- extended `test/images-flow.e2e-spec.ts` to cover auth, premium frame eligibility, private image upload, staged frame changes, and manual reprocess promotion together
- added `src/test/mocks/uuid.mock.ts` and updated `test/jest-e2e.json` so the real image controller graph can load under Jest e2e

Current verification status:

- `npm.cmd run format`: PASS
- `npm.cmd run lint:check`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd test -- --runInBand`: PASS (`14/14` suites, `93/93` tests)
- `npm.cmd run test:e2e -- --runInBand`: PASS (`5/5` suites, `27/27` tests)
- `npm.cmd run migration:show`: still requires a reachable PostgreSQL instance in this workspace before final DB-backed migration verification can be repeated

Current frame-compositing status:

- initial uploads with `frameId` now snapshot the current frame SVG and mark the image render state as ready
- `PATCH /images/:id` stages frame changes through `pendingFrameId` and `frameRenderStatus = pending_reprocess` instead of mutating the active visual output immediately
- `POST /images/:id/reprocess` and `POST /admin/images/:id/reprocess` promote the staged change, bump the active render revision, and queue framed render prewarm
- image reads now return signed composited render URLs for active framed variants, with raw variants retained as the source-of-truth fallback
- cleanup and quota reconciliation now account for framed render cache objects and frame snapshot storage bytes

The detailed findings below remain useful as the original defect record. Use this remediation update to distinguish what was fixed in the current worktree from the historical baseline that motivated the changes.

## 1. Executive Summary

The original audit found `feat/image-upload` to be non-production-ready because the image-upload branch was not yet synchronized with the rest of the backend system. The current worktree has now addressed the major branch blockers across auth, frames, queue/config wiring, schema alignment, private storage, quotas, cleanup, and image-serving behavior.

Current branch quality:

- the branch now builds and lint passes
- the image upload flow is documented in Swagger at the controller and DTO level
- the branch now has explicit e2e coverage that exercises auth, premium frame eligibility, image upload routes, staged frame changes, and manual reprocess together
- real frame application is now implemented through immutable frame snapshots plus read-through composited render caching, rather than storing `frameId` as metadata only
- the image subsystem better matches the overall architecture by enforcing private image reads, backend frame eligibility checks, and persisted subscription/quota state

The main remaining gap in this workspace is verification depth, not compile-time coherence:

- DB-backed migration verification still needs a live PostgreSQL instance before the final migration state can be rechecked end-to-end
- the new e2e coverage is controller-flow integration with mocks, so a full infra-backed storage/queue pipeline test is still a future hardening step rather than something completed in this workspace

Overall system impact:

- the image-upload branch is now aligned with the surrounding auth, frames, storage, queue, quota, and cache systems
- the image/frame relationship now affects actual served media, not just database metadata
- the earlier privacy and premium-entitlement regressions have been addressed in the current worktree
- remaining pre-merge confidence work is concentrated in environment-backed migration verification and deeper storage/worker integration testing rather than structural branch instability

## 2. Branch Change Summary

The branch is centered on image upload, but it necessarily syncs with the rest of the backend platform. Compared with `main`, it touches auth/session logic, premium-frame eligibility, object storage, queues, Redis caching, frame services, and image-specific entities/services because the upload pipeline depends on all of them.

Diff summary:

- Modified files: `22`
- New files: `122`
- Deleted files: `0`
- Total diff: `17,441` insertions, `1,723` deletions

Additional in-scope current worktree files:

- `src/database/migrations/1773741400000-create-image-table.ts`
- `src/images/controllers/images.controller.ts`
- `src/images/controllers/images-admin.controller.ts`
- `src/images/controllers/upload-sessions.controller.ts`
- `src/images/dto/batch-get-images.dto.ts`
- `src/images/dto/complete-upload.dto.ts`
- `src/images/dto/query-images.dto.ts`
- `src/images/dto/request-upload-url.dto.ts`
- `src/images/dto/update-image.dto.ts`
- `src/images/guards/image-owner.guard.ts`
- `src/images/services/images.service.ts`
- `src/images/services/image-processing.service.ts`
- `src/images/workers/image-processing.worker.ts`
- `src/images/workers/upload-cleanup.worker.ts`
- `src/test/mocks/uuid.mock.ts`
- `test/images-flow.e2e-spec.ts`

Primary modules/services touched:

- `AuthModule`: `AuthController`, `AuthService`, `JwtStrategy`, admin/auth guards, OAuth providers
- shared infra: `StorageService`, `CacheService`, `PaginationService`, `SlugService`, `QueueModule`, Redis helpers, config validation
- `FramesModule`: frame CRUD, categories/tags, `FrameAssetsService`, public APIs, premium guard, popularity sync
- `ImagesModule`: DTOs, entities, `UploadService`, `StorageQuotaService`, `ImageVariantService`, cache helpers
- bootstrap/runtime: `AppModule`, `main.ts`, `.env.example`, `docker-compose.yml`, `README.md`

What the branch is trying to implement:

- platform auth and role support
- frame-management and SVG upload/storage
- object-storage abstraction with S3-compatible backend
- queue-backed private image-processing pipeline with user storage quotas and premium-frame attachment checks
- performance tests and operational docs

Post-audit remediation added:

- Swagger documentation for image upload/session/admin endpoints and request DTOs
- snapshot-based frame compositing with `frameSnapshotKey`, `pendingFrameId`, `frameRenderStatus`, `activeRenderRevision`, and `image_render_variants`
- owner/admin reprocess routes for promoting staged frame changes and prewarming framed render outputs
- e2e coverage for auth + frame + image interaction via `test/images-flow.e2e-spec.ts`, including staged frame changes and manual reprocess
- Jest e2e shims needed to load the real image controller graph under the current toolchain

### Modified Files

```text
.env.example
.eslintrc.js
.gitignore
README.md
docker-compose.yml
package-lock.json
package.json
src/app.module.ts
src/auth/auth.module.ts
src/auth/entities/refresh-token.entity.ts
src/auth/entities/user.entity.ts
src/auth/enums/index.ts
src/auth/interfaces/auth-response.interface.ts
src/auth/interfaces/jwt-payload.interface.ts
src/common/config/env.validation.ts
src/common/config/index.ts
src/common/filters/http-exception.filter.ts
src/common/interceptors/transform.interceptor.ts
src/common/redis/redis.service.ts
src/health/health.controller.ts
src/main.ts
test/jest-e2e.json
```

### New Files

Sample assets:

```text
sample-svgs/abstract.svg
sample-svgs/birthday.svg
sample-svgs/graduation.svg
sample-svgs/holiday.svg
sample-svgs/movement.svg
sample-svgs/nature.svg
sample-svgs/political.svg
sample-svgs/religion.svg
sample-svgs/sports.svg
sample-svgs/wedding.svg
```

Auth:

```text
src/auth/__tests__/auth.controller.integration.spec.ts
src/auth/__tests__/auth.service.spec.ts
src/auth/__tests__/guards/jwt-auth.guard.spec.ts
src/auth/__tests__/providers/google-oauth.provider.spec.ts
src/auth/auth.controller.ts
src/auth/auth.service.ts
src/auth/constants/auth.constants.ts
src/auth/decorators/current-user.decorator.ts
src/auth/decorators/index.ts
src/auth/decorators/public.decorator.ts
src/auth/dto/index.ts
src/auth/dto/oauth-login.dto.ts
src/auth/dto/refresh-token.dto.ts
src/auth/dto/update-profile.dto.ts
src/auth/enums/user-role.enum.ts
src/auth/guards/admin.guard.ts
src/auth/guards/brute-force.guard.ts
src/auth/guards/custom-throttle.guard.ts
src/auth/guards/index.ts
src/auth/guards/jwt-auth.guard.ts
src/auth/guards/optional-jwt.guard.ts
src/auth/providers/apple-oauth.provider.ts
src/auth/providers/google-oauth.provider.ts
src/auth/providers/index.ts
src/auth/providers/oauth-provider.factory.ts
src/auth/providers/oauth-provider.interface.ts
src/auth/strategies/jwt.strategy.ts
```

Common/shared infra:

```text
src/common/config/queue.config.ts
src/common/config/storage.config.ts
src/common/config/throttle.config.ts
src/common/filters/business.exception.ts
src/common/queue/queue.constants.ts
src/common/queue/queue.module.ts
src/common/services/__tests__/cache.service.spec.ts
src/common/services/__tests__/pagination.service.spec.ts
src/common/services/__tests__/slug.service.spec.ts
src/common/services/__tests__/storage.service.spec.ts
src/common/services/cache.service.ts
src/common/services/index.ts
src/common/services/pagination.service.ts
src/common/services/slug.service.ts
src/common/services/storage.service.ts
src/common/services/storage/storage.port.ts
src/common/services/storage/storage.tokens.ts
src/common/shared.module.ts
```

Database:

```text
src/database/migrations/1772302000000-add-user-role.ts
src/database/migrations/1772302100000-create-frames-schema.ts
src/database/migrations/1772302200000-seed-default-frame-categories.ts
src/database/migrations/1772302300000-seed-sample-frames.ts
```

Frames:

```text
src/frames/controllers/categories-admin.controller.ts
src/frames/controllers/categories.controller.ts
src/frames/controllers/frames-admin.controller.ts
src/frames/controllers/frames.controller.ts
src/frames/controllers/index.ts
src/frames/controllers/tags-admin.controller.ts
src/frames/cron/frames-sync.cron.ts
src/frames/dto/create-category.dto.ts
src/frames/dto/create-frame.dto.ts
src/frames/dto/create-tag.dto.ts
src/frames/dto/index.ts
src/frames/dto/query-frames.dto.ts
src/frames/dto/query-taxonomy.dto.ts
src/frames/dto/update-category.dto.ts
src/frames/dto/update-frame.dto.ts
src/frames/dto/update-tag.dto.ts
src/frames/entities/category.entity.ts
src/frames/entities/frame-asset-type.enum.ts
src/frames/entities/frame-asset.entity.ts
src/frames/entities/frame-category.entity.ts
src/frames/entities/frame-orientation.enum.ts
src/frames/entities/frame-tag.entity.ts
src/frames/entities/frame.entity.ts
src/frames/entities/index.ts
src/frames/entities/tag.entity.ts
src/frames/entities/user-saved-frame.entity.ts
src/frames/frames.module.ts
src/frames/guards/index.ts
src/frames/guards/premium-frame.guard.ts
src/frames/services/__tests__/categories.service.spec.ts
src/frames/services/__tests__/frame-assets.service.spec.ts
src/frames/services/__tests__/tags.service.spec.ts
src/frames/services/categories.service.ts
src/frames/services/frame-assets.service.ts
src/frames/services/frames-cache.service.ts
src/frames/services/frames-warmup.service.ts
src/frames/services/frames.service.ts
src/frames/services/index.ts
src/frames/services/tags.service.ts
```

Images:

```text
src/images/dto/batch-get-images.dto.ts
src/images/dto/complete-upload.dto.ts
src/images/dto/query-images.dto.ts
src/images/dto/request-upload-url.dto.ts
src/images/dto/update-image.dto.ts
src/images/entities/image-variant.entity.ts
src/images/entities/image.entity.ts
src/images/entities/upload-session.entity.ts
src/images/entities/user-storage-quota.entity.ts
src/images/images.module.ts
src/images/services/image-variant.service.ts
src/images/services/images-cache.service.ts
src/images/services/storage-quota.service.ts
src/images/services/upload.service.ts
src/images/types/image.types.ts
```

Tests and perf:

```text
src/test/mocks/dompurify.mock.ts
src/test/mocks/jsdom.mock.ts
test/auth.e2e-spec.ts
test/frames-admin.e2e-spec.ts
test/frames-flow.e2e-spec.ts
test/frames.e2e-spec.ts
test/perf/frames-list.k6.js
test/perf/run-frames-list.js
test/perf/run-frames-list.ps1
```

### Deleted Files

None.

## 3. Critical Issues

This section captures the original high-severity defects found in the audit baseline. Most of the compile/config/schema/privacy issues described below have been fixed in the current worktree and are preserved here as traceability for why the remediation was necessary.

### 3.1 The current worktree still does not build, so the image subsystem is not deployable

Affected files:

- `src/common/queue/queue.module.ts`
- `src/images/controllers/images.controller.ts`
- `src/images/controllers/upload-sessions.controller.ts`
- `src/images/services/images.service.ts`
- `src/images/workers/image-processing.worker.ts`

Why this is dangerous:

- `npm run build` still fails.
- The image controllers read `req['user'].id` from a plain Express `Request`, which TypeScript rejects.
- `ImagesService` calls `paginationService.paginate(...)`, but `PaginationService` does not implement `paginate`.
- `ImageProcessingWorker` and `ImagesService` also fail TypeORM partial-update typing around `exifData`.
- `QueueModule` still imports a non-existent `constants` export.

How it manifests:

- the branch cannot be shipped as-is
- CI/build pipelines fail before runtime validation even begins
- the current image stack is blocked at compile time, not just at runtime

### 3.2 The new image migration creates a schema that does not match the entities

Affected files:

- `src/database/migrations/1773741400000-create-image-table.ts`
- `src/images/entities/image.entity.ts`
- `src/images/entities/image-variant.entity.ts`
- `src/images/entities/upload-session.entity.ts`
- `src/images/entities/user-storage-quota.entity.ts`

Why this is dangerous:

- the migration creates camelCase columns such as `userId`, `storageKey`, `processingStatus`, `expectedFileSize`, and `cdnUrl`
- the entities explicitly map to snake_case columns such as `user_id`, `storage_key`, `processing_status`, `expected_file_size`, and `cdn_url`
- `images.checksum` in the migration does not match `check_sum` in the entity

How it manifests:

- if this migration is applied, TypeORM queries generated from the entities will target columns that do not exist
- image uploads, listing, worker updates, and cleanup jobs will fail against the deployed schema even after the build issues are fixed

### 3.3 `completeUpload()` is still non-atomic even after the transaction wrapper was added

Affected files:

- `src/images/services/upload.service.ts`
- `src/images/services/image-variant.service.ts`
- `src/images/services/storage-quota.service.ts`

Why this is dangerous:

- the object is copied to permanent storage and the temp object is deleted before the DB transaction begins
- inside the transaction callback, `imageVariantService.createVariant(...)` and `storageQuotaService.confirmUsage(...)` use their own repositories/services instead of the transaction manager
- the Bull job is added only after the transaction finishes and there is no outbox or compensation path

How it manifests:

- objects can be promoted in storage even if DB writes later fail
- quota can be mutated outside the transaction boundary
- successful DB commit can still be followed by queue-enqueue failure, leaving images stuck in `uploaded`

### 3.4 Upload validation and business rules are still incomplete

Affected files:

- `src/images/dto/request-upload-url.dto.ts`
- `src/images/services/upload.service.ts`

Why this is dangerous:

- the service still trusts the client-declared MIME type and never validates the uploaded bytes
- it does not validate `frameId` at all
- it no longer compares actual uploaded size to expected size and does not re-check quota against actual size before confirmation

How it manifests:

- arbitrary non-image payloads can be accepted as images
- orphaned `frameId` references are persisted
- quota can be exceeded if the uploaded object is larger than the reserved size

### 3.5 The API and storage access model contradict each other

Affected files:

- `src/images/controllers/images.controller.ts`
- `src/images/services/images.service.ts`
- `docker-compose.yml`
- `src/images/entities/image.entity.ts`
- `src/images/services/image-variant.service.ts`

Why this is dangerous:

- every image route is guarded by `JwtAuthGuard`
- `ImagesService` contains ownership-or-public logic and the entity has `isPublic`
- storage still grants anonymous download to `images/` and variants store direct CDN URLs

How it manifests:

- anonymous users cannot access images through the API even when the domain model says the image is public
- if a direct URL leaks, storage bypasses the API and serves private assets anyway

### 3.6 Premium frame access is impossible for non-admin users

Affected files:

- `src/auth/auth.service.ts`
- `src/frames/guards/premium-frame.guard.ts`

Why this is dangerous:

- all issued JWTs hardcode `subscriptionActive: false`
- the premium guard denies premium assets unless that claim is true

How it manifests:

- premium frame purchase/subscription flows cannot succeed for normal users
- monetized content is effectively inaccessible except to admins

## 4. Detailed Findings

### 4.1 The current image worktree is wired into Nest, but it still fails build-time integration

Affected files:

- `src/common/queue/queue.module.ts`
- `src/images/controllers/images.controller.ts`
- `src/images/controllers/upload-sessions.controller.ts`
- `src/images/services/images.service.ts`
- `src/common/services/pagination.service.ts`
- `src/images/workers/image-processing.worker.ts`

Code snippet:

```ts
// src/images/controllers/images.controller.ts
@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  ...
  @Post('upload-url')
  async requestUploadUrl(@Req() req: Request, @Body() dto: RequestUploadUrlDto) {
    const userId = req['user'].id;
```

```ts
// src/images/services/images.service.ts
const result = await this.paginationService.paginate(qb, {
  page: query.page || 1,
  limit: query.limit || 20,
});
```

Explanation:

- The local worktree does wire `ImagesModule` with controllers, services, queues, workers, and the migration.
- That resolves the earlier “empty module” problem, but the replacement implementation still does not compile cleanly.
- The controllers use a request shape that is not typed safely.
- `PaginationService` still only exposes `resolve()` and `buildMeta()`, so `paginate()` does not exist.
- The queue module still has the bad `constants` import, and the worker/update typing errors remain.

Real-world impact:

- the feature cannot pass CI or be deployed
- the current module wiring is not usable proof of readiness because the compiler already rejects the integration

### 4.2 The image-table migration is incompatible with the ORM mapping

Affected files:

- `src/database/migrations/1773741400000-create-image-table.ts`
- `src/images/entities/image.entity.ts`
- `src/images/entities/image-variant.entity.ts`
- `src/images/entities/upload-session.entity.ts`
- `src/images/entities/user-storage-quota.entity.ts`

Code snippet:

```ts
// migration
{ name: 'userId', type: 'uuid', isNullable: false },
{ name: 'storageKey', type: 'varchar', length: '512', isNullable: false, isUnique: true },
{ name: 'processingStatus', type: 'processing_status_enum', default: "'pending'" },
```

```ts
// entity
@Column({ name: 'user_id', type: 'uuid' })
userId: string;

@Column({ name: 'storage_key', type: 'varchar', length: 512, unique: true })
storageKey: string;

@Column({ name: 'processing_status', type: 'enum', enum: ProcessingStatus })
processingStatus: ProcessingStatus;
```

Explanation:

- The migration consistently uses camelCase DB column names.
- The entities consistently declare snake_case DB column names.
- This mismatch repeats across `images`, `image_variants`, `upload_sessions`, and `user_storage_quotas`.
- `checksum` vs `check_sum` is a separate direct mismatch even within the same table.

Real-world impact:

- migrations may run successfully but produce a schema the application cannot read/write correctly
- the failure will surface under normal ORM operations, not only under edge cases
- the image module would remain broken even after the compile errors are resolved

### 4.3 The transaction wrapper in `completeUpload()` provides false safety

Affected files:

- `src/images/services/upload.service.ts`
- `src/images/services/image-variant.service.ts`
- `src/images/services/storage-quota.service.ts`

Code snippet:

```ts
const permanentKey = session.storageKey.replace('tmp/', 'images/');
await this.storageService.copyObject(session.storageKey, permanentKey);
...
await this.storageService.deleteObject(session.storageKey);

await this.dataSource.transaction(async (manager) => {
  const imageRepo = manager.getRepository(Image);
  const sessionRepo = manager.getRepository(UploadSession);

  await imageRepo.save(image);
  await sessionRepo.update(session.id, { status: UploadSessionStatus.COMPLETED, completedAt: new Date() });
  await this.imageVariantService.createVariant({ ... });
  await this.storageQuotaService.confirmUsage(userId, actualSize, expectedSize);
});
```

Explanation:

- Storage promotion happens entirely outside the transaction.
- The transaction callback mixes `manager`-scoped repositories with service calls that use their own repositories and Redis side effects.
- Queue enqueueing also sits outside the transaction boundary.

Real-world impact:

- permanent objects can exist without a matching persisted image row
- quota confirmation can succeed even when part of the DB work later rolls back
- queue failure after DB success still leaves the image in a half-finished processing state

### 4.4 Upload validation still trusts the client and no longer re-checks actual size against quota

Affected files:

- `src/images/dto/request-upload-url.dto.ts`
- `src/images/services/upload.service.ts`

Code snippet:

```ts
await this.storageQuotaService.checkQuotaAvailability(userId, dto.fileSize);
...
const head = await this.storageService.headObject(session.storageKey);
const actualSize = head.contentLength!;
const expectedSize = Number(session.expectedFileSize);
...
await this.storageQuotaService.confirmUsage(userId, actualSize, expectedSize);
```

Explanation:

- The upload URL is still issued based on user-declared metadata.
- `completeUpload()` does not inspect actual file bytes or `head.contentType`.
- The new version also removed the explicit “actual size exceeds quota” re-check before promotion/confirmation.
- `frameId` is written straight into the session without any validation step.

Real-world impact:

- non-image payloads can still enter the system
- oversized actual uploads can outgrow the reserved quota
- broken frame references can be stored permanently

### 4.5 Public/private image access is internally inconsistent

Affected files:

- `src/images/controllers/images.controller.ts`
- `src/images/services/images.service.ts`
- `docker-compose.yml`
- `src/images/entities/image.entity.ts`

Code snippet:

```ts
@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesController { ... }
```

```ts
if (image.userId !== userId && !image.isPublic) {
  throw new BusinessException(...);
}
```

Explanation:

- The controller prevents anonymous access to every image route.
- The service layer and entity model both support public images.
- Storage still makes `/images/` directly downloadable.

Real-world impact:

- public-image behavior cannot work correctly through the API
- private-image behavior cannot be enforced correctly at the storage layer
- the system ends up both over-restrictive and under-protective at the same time

### 4.6 `ImageProcessingWorker` can mark broken images as completed and never updates the original variant correctly

Affected files:

- `src/images/workers/image-processing.worker.ts`
- `src/images/services/image-variant.service.ts`

Code snippet:

```ts
if (originalVariant) {
  await this.imageVariantService
    .createVariant({
      imageId,
      variantType: VariantType.ORIGINAL,
      storageKey,
      mimeType,
      fileSize: originalBuffer.length,
      width,
      height,
    })
    .catch(() => {
      // Variant already exists — this is expected for the original
    });
}
```

```ts
for (const [variantType, config] of Object.entries(variantConfigs)) {
  try {
    ...
  } catch (variantError) {
    this.logger.error(...);
    // Continue processing other variants
  }
}
...
await this.imageRepository.update(imageId, {
  processingStatus: ProcessingStatus.COMPLETED,
  ...
});
```

Explanation:

- The worker tries to “update” the original variant by inserting the same unique `(imageId, variantType)` pair again and swallowing the failure.
- That means the original variant can remain stuck at `width = 0`, `height = 0`.
- Individual variant generation failures are logged and ignored, but the image is still marked `COMPLETED` afterward.

Real-world impact:

- clients can receive a “completed” image with missing thumbnails or incomplete variants
- original variant metadata can remain permanently incorrect
- storage/quota numbers drift away from the real usable asset set

### 4.7 Quota and daily-upload controls are race-prone, Redis-only, and fail open

Affected files:

- `src/images/services/upload.service.ts`
- `src/images/services/storage-quota.service.ts`
- `src/images/services/images-cache.service.ts`
- `src/common/services/cache.service.ts`

Code snippet:

```ts
// src/images/services/upload.service.ts
const dailyCount = await this.imagesCacheService.getDailyUploadCount(userId);
...
await this.storageQuotaService.checkQuotaAvailability(userId, dto.fileSize);
...
await this.uploadSessionRepository.save(session);
await this.storageQuotaService.reservePending(userId, dto.fileSize);
await this.imagesCacheService.incrementDailyUploadCount(userId);
```

```ts
// src/common/services/cache.service.ts
async getNumber(key: string): Promise<number> {
  try {
    const value = await this.redisService.get(key);
    if (!value) {
      return 0;
    }
    return Number(value);
  } catch (error) {
    this.logger.warn(...);
    return 0;
  }
}
```

Explanation:

- Quota validation and reservation are separate operations with no lock or single atomic command.
- Two or more parallel `requestUploadUrl()` calls can all read the same quota snapshot and all succeed before pending bytes are reserved.
- Pending bytes exist only in Redis, not in durable storage.
- Cache helpers return `0` on Redis failures, so `dailyCount` and `pendingBytes` silently collapse to zero if Redis is unhealthy.

Real-world impact:

- users near quota can obtain more presigned URLs than their quota should permit
- Redis outages disable daily-upload limiting and undercount pending usage
- Redis restarts lose pending reservations even though uploaded temp objects still occupy storage

### 4.8 Storage privacy is broken and temp cleanup is misconfigured

Affected files:

- `docker-compose.yml`
- `src/images/entities/image.entity.ts`
- `src/images/entities/image-variant.entity.ts`
- `src/images/services/image-variant.service.ts`
- `src/images/services/storage-quota.service.ts`

Code snippet:

```sh
# docker-compose.yml
mc anonymous set download local/frame-assets/frames &&
mc anonymous set download local/frame-assets/images/ &&
mc ilm rule add local/frame-images-dev --prefix 'tmp/' --expire-days 1 || true &&
```

```ts
// src/images/entities/image.entity.ts
@Column({ name: 'is_public', type: 'boolean', default: false })
isPublic: boolean;
```

```ts
// src/images/services/image-variant.service.ts
const cdnUrl = this.storageService.getPublicUrl(data.storageKey);
```

Explanation:

- The storage policy grants anonymous download for `images/`, but the domain model declares images private by default.
- `ImageVariant` persists a public `cdnUrl` for every variant regardless of `isPublic`.
- The lifecycle rule is applied to `frame-images-dev`, which is not the bucket created by this compose file (`frame-assets`).
- `reservePending()` also does not set a TTL on pending quota keys, so stale reservations can survive even longer than the abandoned temp object cleanup path.

Real-world impact:

- future API responses can leak public image URLs even for private images
- the storage layer, not the API, becomes the source of truth for access control
- abandoned `tmp/` uploads do not expire automatically in local/dev infra because the lifecycle rule targets the wrong bucket

### 4.9 Cleanup/cron integration is unreliable and the admin trigger reports fake results

Affected files:

- `src/images/images.module.ts`
- `src/images/workers/upload-cleanup.worker.ts`
- `src/images/controllers/images-admin.controller.ts`

Code snippet:

```ts
// src/images/images.module.ts
imports: [
  ConfigModule,
  ScheduleModule.forRoot(),
  ...
]
```

```ts
// src/images/workers/upload-cleanup.worker.ts
async triggerCleanup(): Promise<{
  expiredSessions: number;
  hardDeleted: number;
}> {
  await this.handleExpiredSessions();
  await this.handleHardDeletes();
  return { expiredSessions: 0, hardDeleted: 0 };
}
```

Explanation:

- `AppModule` already initializes `ScheduleModule.forRoot()`, so calling it again inside `ImagesModule` is unnecessary and risks duplicate scheduler registration.
- The admin cleanup trigger always returns zero counts regardless of the real cleanup work performed.
- The hard-delete path also removes variant rows before confirming object-storage deletion, which makes retries less observable after partial failures.

Real-world impact:

- cron cleanups become harder to reason about operationally
- admin-triggered cleanup responses cannot be trusted for auditing or incident response
- partial hard-delete failures leave less metadata available for recovery

### 4.10 Premium frame entitlement cannot succeed for a real user

Affected files:

- `src/auth/auth.service.ts`
- `src/frames/guards/premium-frame.guard.ts`

Code snippet:

```ts
// src/auth/auth.service.ts
const accessPayload: JwtPayload = {
  sub: user.id,
  email: user.email,
  type: 'access',
  role: user.role,
  subscriptionActive: false,
};
```

```ts
// src/frames/guards/premium-frame.guard.ts
if (!payload.subscriptionActive) {
  throw new ForbiddenException({
    code: 'PREMIUM_REQUIRED',
    message: 'This frame requires an active premium subscription.',
  });
}
```

Explanation:

- The branch adds premium-gated frame access but never adds a real subscription source of truth.
- Tokens always encode `subscriptionActive: false` for non-admin users.
- The guard then denies premium content whenever that claim is false.

Real-world impact:

- non-admin users can never access premium frame assets
- any future monetization or subscription UX is blocked by backend logic

### 4.11 Cache invalidation uses blocking Redis `KEYS` on the write path

Affected files:

- `src/common/redis/redis.service.ts`
- `src/frames/services/frames-cache.service.ts`

Code snippet:

```ts
// src/common/redis/redis.service.ts
async deleteByPattern(pattern: string): Promise<void> {
  const keys = await this.redis.keys(pattern);
  if (keys.length === 0) {
    return;
  }
  const pipeline = this.redis.pipeline();
  for (const key of keys) {
    const strippedKey = key.replace(/^frame:/, '');
    pipeline.del(strippedKey);
  }
  await pipeline.exec();
}
```

```ts
// src/frames/services/frames-cache.service.ts
async invalidateFrame(id: string, slug: string): Promise<void> {
  await this.cacheService.del(this.getFrameKey(id));
  await this.cacheService.del(this.getFrameSlugKey(slug));
  await this.cacheService.invalidateByPattern('frames:list:*');
  await this.cacheService.del('frames:popular');
}
```

Explanation:

- Redis `KEYS` is an O(N) blocking command.
- The branch uses it in write-path cache invalidation for frame mutations.
- This Redis instance also backs auth/session/caching and, once queues are fixed, Bull queues as well.

Real-world impact:

- admin writes can block Redis for unrelated traffic
- login/session/cache latency will spike as keyspace grows
- throughput becomes sensitive to cache cardinality rather than just request volume

## 5. Security Findings

### 5.1 Arbitrary content can be stored through the image-upload pipeline

Severity: High

Attack scenario:

- Request a presigned upload URL while declaring `mimeType = image/png`.
- Upload non-image bytes with that signed request.
- Call `completeUpload()`.
- The backend accepts the object based on size and existence alone.

Why this matters:

- content validation is a trust boundary and it is currently delegated to the attacker
- later image-processing workers or consumers will fail against untrusted bytes

Recommended fix:

- validate uploaded bytes server-side before persisting the image record
- use `file-type` or equivalent magic-byte checks
- decode the object with `sharp` or another real parser
- compare the actual detected type against the requested MIME type
- reject, delete, and release quota on mismatch

### 5.2 Storage-layer anonymity defeats application-layer privacy rules

Severity: High

Attack scenario:

- Upload completes and variants are created with permanent `cdnUrl` values.
- A later API response exposes that variant metadata or a log leak reveals the storage key.
- The object is directly downloadable because `images/` is publicly readable.

Why this matters:

- the model explicitly carries `isPublic`, meaning privacy is expected to be enforceable
- the infrastructure makes that flag meaningless

Recommended fix:

- do not make `images/` anonymously readable
- serve private assets via signed GET URLs or an authenticated proxy
- only expose direct anonymous URLs for assets that are intentionally public

### 5.3 Quota/rate-limit enforcement fails open when Redis is unavailable

Severity: High

Attack scenario:

- Force or wait for a Redis outage.
- Request upload URLs repeatedly.
- The backend reads `0` for daily counts and pending bytes and continues issuing presigned URLs.

Why this matters:

- an attacker can abuse storage and queue resources precisely when the platform is already degraded

Recommended fix:

- do not treat Redis errors as “zero usage”
- fail closed for quota/rate-limit checks or fall back to durable DB-backed enforcement
- store pending reservations durably in the upload session record

### 5.4 Frame association and actual-size quota rules are unenforced

Severity: Medium

Attack scenario:

- Submit any UUID as `frameId`.
- Upload a larger-than-reserved object if the storage layer accepts it.

Why this matters:

- business rules for frame ownership/premium/publicity can be bypassed
- actual storage consumption can exceed the reserved quota window
- historical bad data becomes difficult to clean safely

Recommended fix:

- validate `frameId` through a read-only repository lookup or dedicated `FramesService`
- compare actual uploaded size to reserved size and re-check quota before confirmation
- back it with a foreign key once the images schema exists

## 6. Performance Findings

- Redis invalidation uses `KEYS`, which blocks Redis and scales poorly with cache cardinality.
- Queue config is not loaded, so Bull would fall back to the same default Redis DB used for cache/session traffic, increasing contention.
- The upload pipeline does extra storage round trips (`HEAD`, `COPY`, `DELETE`) without any batching or transaction/outbox coordination, which magnifies latency and retry cost under failure.
- The frame/admin and image/storage work were merged into one broad branch, which increases verification cost and makes performance regressions harder to isolate.

Production impact:

- higher p95/p99 latency on write paths as Redis keyspace grows
- avoidable storage IO and queue contention
- harder capacity planning because queues, cache, and sessions are not cleanly separated

## 7. Reliability and Failure Scenarios

### 7.1 Build and startup reliability

- `npm run build` fails in the current branch worktree.
- Confirmed blockers include:
  - `src/common/queue/queue.module.ts` importing a missing `constants` export
  - image controllers using `req['user'].id` against an unextended `Request`
  - `ImagesService` calling nonexistent `PaginationService.paginate()`
  - TypeORM partial-update typing failures in `ImagesService` and `ImageProcessingWorker`

### 7.2 Partial upload completion

Failure condition:

- object copy to `images/` succeeds and the temp object is deleted
- DB save or queue enqueue fails afterward

Outcome:

- session may stay `pending`
- object already lives under `images/`
- retry path checks the wrong key and cannot self-heal

### 7.3 Abandoned uploads

Failure condition:

- client uploads to `tmp/` and never calls `completeUpload()`
- Redis restarts or lifecycle rules do not clean the bucket

Outcome:

- pending quota becomes inaccurate
- storage accumulates abandoned temp objects
- cleanup depends on manual reconciliation

### 7.4 Storage bootstrap hides broken infrastructure

- `StorageService.ensureBucketExists()` logs and swallows bucket-creation failures, which means the app can appear healthy at startup while storage is already unusable.
- `deleteObject()` also swallows failures, so cleanup paths can silently stop working.

### 7.5 Processing jobs still have unreliable completion semantics

Failure condition:

- `completeUpload()` enqueues `process-image`
- one or more derived variants fail during processing

Outcome:

- the worker can still mark the image `COMPLETED`
- required thumbnails or metadata can remain missing
- operators see a successful status on a partially broken asset

## 8. Architectural Review

This branch fights the architecture more than it fits it.

Key architectural problems:

- The branch scope is too large. A single branch introduces auth, frames, storage, queue, cache, and image-upload work, which makes isolation and regression analysis much harder.
- The image subsystem is now wired, but the wiring is inconsistent across compile-time contracts, migration schema, and runtime access rules.
- Infra decisions bypass domain rules. Public CDN URLs and anonymous bucket access are wired directly into storage/variant logic even though the domain model carries `isPublic`.
- The feature module duplicates root scheduler initialization with `ScheduleModule.forRoot()`, which is a root-level concern and should not be repeated inside a leaf module.
- Configuration is inconsistent. `queue.config.ts` and `imageConfig` are defined but not loaded; `main.ts` reads raw `process.env` instead of the validated `ConfigService`; `env.validation.ts` and runtime defaults disagree on `API_PREFIX`.
- The upload workflow has no clear transactional boundary or outbox/saga. Storage, DB, quota, and queue updates are interleaved in one imperative method with no consistency guarantees.

Net assessment:

- the branch introduces useful building blocks
- but the actual integration quality is not at a production-grade architectural bar

## 9. Recommended Fixes

### 9.1 Make the current image subsystem coherent before merging

- Fix the current compile errors across `QueueModule`, image controllers, `ImagesService`, and the worker layer.
- Align the migration schema with the entity mappings before running it anywhere persistent.
- Remove duplicate root scheduler initialization from `ImagesModule`.

### 9.2 Fix queue compilation and configuration

- Replace `import { constants }` with direct named imports.
- Export/load `queueConfig` in `src/common/config/index.ts` and `ConfigModule.forRoot()`.
- Keep queue Redis DB/prefix isolated from cache/session traffic.

### 9.3 Rework upload completion into a safe state machine

- Persist upload sessions durably in the DB with explicit states.
- Validate the object before promoting it to permanent storage.
- Use a DB transaction for image row, variant row, quota confirmation, and session state.
- Use an outbox/job table or add the Bull job only after DB commit.
- Add compensating cleanup if any post-upload step fails.

### 9.4 Enforce real content validation

- Read the uploaded object and verify magic bytes.
- Decode it with an image library and capture dimensions/orientation.
- Strip EXIF as part of processing unless explicitly required.
- Compare actual MIME/detected format to requested format and reject mismatches.

### 9.5 Make privacy enforceable

- Remove anonymous download from `images/`.
- Use signed GET URLs for private assets.
- Only compute/store public URLs for records explicitly marked public.

### 9.6 Make quota enforcement durable and atomic

- Move pending-reservation accounting into the DB or an atomic Lua script.
- Fail closed when Redis is unavailable for policy checks.
- Add TTL/expiry cleanup tied to upload-session expiry.
- Reconcile quota based on real stored objects as a safety net.

### 9.7 Implement real `frameId` validation

- Validate frame existence and business eligibility before issuing the upload URL.
- Prefer a foreign key once the images schema exists.

### 9.8 Repair premium entitlement

- Introduce a real subscription state source of truth.
- Encode correct `subscriptionActive` claims in JWTs.
- Add integration tests for admin, subscribed user, unsubscribed user, and anonymous access.

### 9.9 Replace `KEYS`-based invalidation

- Use `SCAN`, versioned keys, or explicit tag/version namespaces.
- Keep invalidation O(1) or amortized, not full-keyspace blocking.

## 10. Suggested Code Improvements

Upload handling:

- Create upload sessions in the DB first, with explicit expiry and reserved quota.
- Keep uploaded objects under `tmp/` until validation passes.
- Promote or copy to permanent keys only after DB commit or in a worker that can retry safely.

Validation:

- Detect real file type from bytes.
- Decode image dimensions and reject malformed payloads.
- Store checksum from computed content, not only from user input.

Storage integration:

- Separate public frame-assets storage from private user-image storage.
- Use signed reads for private images.
- Add deterministic cleanup for expired temp objects and cancelled sessions.

Error handling:

- Do not swallow storage bootstrap or cleanup failures silently.
- Surface policy-check failures instead of treating them as zero usage.
- Record recoverable failure states explicitly so operators can retry or reconcile them.

Verification status after remediation:

- current branch build passes with the current worktree
- image upload/session endpoints now have Swagger coverage
- image upload now has e2e coverage for auth, premium frame eligibility, and completion flow via `test/images-flow.e2e-spec.ts`
- migration-generated columns were corrected to match entity mappings in the current worktree
- premium-frame entitlement coverage now includes subscribed and unsubscribed users in the new image flow spec

Remaining verification before final merge:

- rerun `migration:show` and the real migration path against a reachable PostgreSQL instance
- add a deeper infra-backed test pass for storage upload, worker processing, and cleanup if the team wants proof beyond mocked controller-flow e2e coverage
