# Album Service Implementation Document

## 1. Executive Summary

The Album Service should provide a public, searchable, shareable gallery for images rendered through a shared frame experience without duplicating any existing auth, frame, image, storage, cache, or queue responsibilities.

This design is intentionally based on the current `frame-api` codebase, not on a greenfield assumption:

- Auth is already centralized behind a global JWT app guard, with `@Public()` and `OptionalJwtGuard` used for public reads that may still personalize responses.
- Frames are currently admin-managed template records with `slug`, `isActive`, premium gating, categories, tags, and public read endpoints. They are not user-private shareable objects today.
- Images are owner-scoped, private-by-default records with optional `frameId`, render revisions, frame snapshotting, variant generation, quota tracking, and BullMQ-based async processing.
- Storage already distinguishes public frame assets from private image assets through CDN URLs for frames and presigned URLs for images.
- The existing queue stack is BullMQ over Redis, not RabbitMQ.

Because of that baseline, the production-safe interpretation of "share frame -> create album" in this repository is:

- `Frame` remains the reusable template catalog record.
- `Album` becomes the publication/share layer.
- `Album.shortCode` becomes the public identifier.
- `Album.frameId` references the existing template frame record.
- Images contributed through a shared album continue to use the existing image pipeline and storage keys, while album rows only reference those image records.

This preserves current module responsibilities and avoids destabilizing the existing frame/image architecture.

## 2. Architecture Overview

### 2.1 Service Positioning

The Album Service should be added as a new NestJS module in the same monolith:

- `AuthModule` remains the identity and permission boundary.
- `FramesModule` remains the source of frame template truth and premium entitlement checks.
- `ImagesModule` remains the owner of uploads, processing, frame compositing, variant generation, and storage quota.
- `AlbumsModule` becomes the owner of publication state, public discovery, album membership, and album analytics.
- `SharedModule`, `RedisModule`, `QueueModule`, and TypeORM continue to provide common infrastructure.

### 2.2 Current Audit Findings That Shape The Design

The following existing behaviors are critical:

1. Frames are public catalog records today.
   The current frame domain exposes public list/detail endpoints and admin-only mutation endpoints. There is no current `Frame.isPublic`, `Frame.shortCode`, or user-owned private frame workflow.

2. Images are private owner-scoped records today.
   All image controller routes are authenticated. `Image.isPublic` exists in schema but is not currently used to power public image reads.

3. A frame reference alone is not enough to identify an album.
   If multiple users can share the same template frame, `Image.frameId` by itself cannot tell the system which shared album context the image belongs to.

4. The async platform is BullMQ + Redis.
   Album jobs should follow the same queue and retry conventions instead of introducing a second async transport just for this feature.

### 2.3 Recommended Boundary Model

To integrate cleanly with the current codebase, the Album Service should use this boundary:

- `Frame` answers: "Which template was used?"
- `Album` answers: "Which public share/publication context is this?"
- `Image` answers: "Which owner uploaded/rendered this media, and what active frame/render revision does it have?"
- `AlbumItem` answers: "Which completed image belongs in which shared album?"

### 2.4 Required Cross-Entity Additions Beyond The Requested Album Tables

The requested `Album`, `AlbumItem`, and `AlbumStats` entities are necessary but not sufficient. To support the business flow reliably, add:

- `upload_sessions.album_id` nullable FK to `albums.id`
- `images.album_id` nullable FK to `albums.id`

These two columns are what allow the current image pipeline to preserve share context from upload request through render completion. Without them, the system cannot reliably decide which album to populate when multiple albums reference the same `frameId`.

### 2.5 Storage Integration Principle

The Album Service must never create its own image objects, thumbnail pipeline, or render cache. It should only:

- reference `images`, `image_variants`, and `image_render_variants`
- reuse existing storage keys
- reuse signed URL generation through `StorageService`
- optionally surface frame metadata already stored in `frames` and `frame_assets`

## 3. Data Model Design

### Album Entity

Required fields:

- `id: uuid`
- `name: varchar(255)`
- `description: text | null`
- `shortCode: varchar(32)`
- `frameId: uuid`
- `ownerId: uuid`
- `isPublic: boolean`
- `createdAt: timestamptz`
- `updatedAt: timestamptz`

Recommended TypeORM definition:

```ts
@Entity('albums')
@Index('idx_album_shortcode', ['shortCode'], { unique: true })
@Index('idx_album_frame', ['frameId'])
@Index('idx_album_owner', ['ownerId'])
@Index('idx_album_public_created', ['isPublic', 'createdAt'])
@Index('idx_album_owner_frame', ['ownerId', 'frameId'], { unique: true })
export class Album {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'short_code', type: 'varchar', length: 32, unique: true })
  shortCode: string;

  @Column({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

Production notes:

- `shortCode` should be an opaque share code, not a slug. A new `ShortCodeService` is recommended instead of reusing `SlugService`.
- `ownerId + frameId` should be unique if the product wants a single share album per owner/template pair. This matches the current "click Share -> create album automatically" behavior and makes repeated share actions idempotent.
- `frameId` should FK to `frames.id` with `ON DELETE RESTRICT` or `NO ACTION`. Frames are already soft-deleted through `isActive`, so hard deletes should not silently orphan albums.

### AlbumItem Entity

Required fields:

- `id: uuid`
- `albumId: uuid`
- `imageId: uuid`
- `frameId: uuid`
- `userId: uuid`
- `createdAt: timestamptz`

Recommended TypeORM definition:

```ts
@Entity('album_items')
@Index('idx_album_item_album_created', ['albumId', 'createdAt'])
@Index('idx_album_item_image', ['imageId'])
@Index('idx_album_item_user', ['userId'])
@Index('idx_album_item_frame', ['frameId'])
@Index('idx_album_item_album_image', ['albumId', 'imageId'], { unique: true })
export class AlbumItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'album_id', type: 'uuid' })
  albumId: string;

  @Column({ name: 'image_id', type: 'uuid' })
  imageId: string;

  @Column({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
```

Production notes:

- `albumId + imageId` must be unique so queue retries stay idempotent.
- `frameId` should be copied from the image state at insertion time for search and analytics.
- Strongly recommended additional column: `imageRenderRevision`.
  This protects public album views from drifting when a contributor later edits the same image record to a new frame/render revision.

### AlbumStats Entity (Optional)

Required fields:

- `albumId: uuid`
- `viewCount: integer`
- `renderCount: integer`
- `shareCount: integer`

Recommended TypeORM definition:

```ts
@Entity('album_stats')
export class AlbumStats {
  @PrimaryColumn({ name: 'album_id', type: 'uuid' })
  albumId: string;

  @Column({ name: 'view_count', type: 'integer', default: 0 })
  viewCount: number;

  @Column({ name: 'render_count', type: 'integer', default: 0 })
  renderCount: number;

  @Column({ name: 'share_count', type: 'integer', default: 0 })
  shareCount: number;
}
```

Production notes:

- This table should be updated asynchronously for high-traffic counters.
- If future analytics become event-heavy, mirror the current frame popularity pattern by accumulating Redis counters and flushing them to Postgres on a schedule.

### Additional Schema Changes Required For Clean Integration

Add to `upload_sessions`:

- `album_id uuid null`
- index `idx_upload_session_album`
- FK `fk_upload_session_album -> albums.id`

Add to `images`:

- `album_id uuid null`
- index `idx_image_album`
- FK `fk_images_album -> albums.id`

This allows the album context to survive from share link -> upload session -> persisted image -> processing worker -> album ingestion worker.

## 4. API Endpoints

The application already applies a global `/api/v1` prefix. The endpoints below are controller-local paths.

### Album Creation

`POST /albums`

Purpose:

- Called when a user clicks Share on a frame experience
- Creates or returns the album tied to that share context
- Returns the public `shortCode`

Auth:

- authenticated route

Request body:

```json
{
  "frameId": "uuid",
  "name": "Optional Album Name",
  "description": "Optional public description"
}
```

Behavior:

1. Validate frame exists and is active.
2. Reuse frame entitlement logic for premium frames.
3. Check whether `(ownerId, frameId)` album already exists.
4. If yes, return the existing album.
5. If no, generate `shortCode`, create album, create stats row, warm cache.
6. Return share URL metadata.

Response shape:

```json
{
  "id": "uuid",
  "shortCode": "A1b2C3d4",
  "frameId": "uuid",
  "ownerId": "uuid",
  "isPublic": true,
  "shareUrl": "https://app.example.com/albums/A1b2C3d4"
}
```

### Get Album

`GET /albums/:shortCode`

Purpose:

- Public album detail lookup
- Returns album metadata, frame summary, stats, and paginated item preview

Auth:

- `@Public()` plus `OptionalJwtGuard`

Behavior:

- public callers can access only `isPublic = true`
- owner or admin may access non-public albums if private mode is added later
- use signed URLs for image variants

### Search Album

`GET /albums/search`

Supported filters:

- `shortCode`
- `frameId`
- `ownerId`
- `creator` text match
- `tag` future
- `page`
- `limit`

Behavior:

- default to public albums only
- future tag search should first reuse existing `frames -> tags` relations before introducing album-specific tags

### Add Image to Album

`POST /albums/:id/images`

Purpose:

- Internal ingestion endpoint or service method
- Triggered automatically after image processing/render completion

Auth:

- internal worker call only, or admin-protected if exposed for operations

Request body:

```json
{
  "imageId": "uuid",
  "frameId": "uuid",
  "userId": "uuid"
}
```

Behavior:

- validate album exists
- validate image exists and belongs to that album context
- insert idempotently into `album_items`
- update stats/cache

### List Album Images

`GET /albums/:id/images`

Purpose:

- Paginated image listing for public album views or owner management

Auth:

- public for public albums
- owner/admin for private mode

Response fields should reuse existing image metadata and signed variant URLs rather than inventing a new media model.

## 5. Frame Service Integration

### 5.1 Audit Baseline

Current frame behavior in this repository:

- frames are created and updated through admin endpoints
- public reads use `slug` and `id`
- premium access is enforced through `FramesService.assertFrameEligibleForImage()` and `PremiumFrameGuard`
- frame popularity uses Redis sorted sets and scheduled Postgres sync
- there is no current frame share mutation, no `shortCode`, and no frame-private workflow

### 5.2 Correct Mapping Of The Share Requirement

The product statement says:

- frame starts private
- share makes frame public
- shortCode becomes album identifier

In this codebase, that should map to:

- the template frame remains a reusable catalog record
- the album is the share/publication record
- `Album.isPublic` is the publish toggle
- `Album.shortCode` is the public identifier

This avoids corrupting the meaning of `frames.isActive`, `frames.slug`, and global public frame browsing.

### 5.3 Recommended Share Flow

Recommended flow:

1. User selects a frame template in the existing frame experience.
2. User clicks Share.
3. Frontend calls `POST /albums` with `frameId`.
4. `AlbumsService` validates the frame through the existing frame entitlement path.
5. `AlbumsService` generates `shortCode` and creates the album.
6. Response returns the share URL based on `shortCode`.

### 5.4 Repeated Share Behavior

To keep behavior deterministic:

- repeated share by the same owner for the same frame should return the same album
- do not generate a second album unless the product later introduces explicit "new campaign/new album" semantics

### 5.5 Frame Search And Future Tags

Future album tag search should initially reuse the source frame's current tags and categories:

- `albums.frameId -> frames.id`
- `frames.tags`
- `frames.categories`

This keeps the first production release small and aligned with existing data.

## 6. Image Service Integration

### 6.1 Audit Baseline

The current image pipeline already supports:

- upload sessions
- quota reservation and confirmation
- optional frame attachment at upload time
- frame SVG snapshotting into object storage
- async original and variant processing
- render revisions and staged frame/transform changes
- owner-only image read/update/delete endpoints

This is the correct place to keep all media-processing logic.

### 6.2 Album Context Must Enter At Upload Request Time

When a user opens a shared album link and renders an image, the image pipeline must know which album context the upload belongs to.

Recommended DTO addition:

- add `albumShortCode?: string` to `RequestUploadUrlDto`

Recommended `requestUploadUrl` rules:

1. Resolve `albumShortCode -> album`.
2. Validate album exists and is public.
3. Derive `frameId` from the album.
4. If client also supplied `frameId`, require it to match `album.frameId`.
5. Persist `albumId` and `frameId` on `upload_sessions`.

This prevents a client from using a valid short code but rendering against a different frame.

### 6.3 Upload Completion Integration

During `completeUpload`:

- copy `upload_sessions.album_id` into `images.album_id`
- preserve the existing `frameId`, frame snapshot, frame placement, and render revision behavior exactly as implemented today
- do not create `AlbumItem` synchronously inside `UploadService`

Reason:

- upload completion should stay focused on image persistence, quota accounting, and queue handoff
- album population should happen after processing succeeds

### 6.4 Render Completion -> Album Population

After `ImageProcessingWorker` completes successfully:

1. Existing processing finishes.
2. Existing variant records are created.
3. Existing frame render prewarm is queued if applicable.
4. If `image.albumId` is not null, enqueue `album.image.added`.
5. `AlbumsWorker` idempotently inserts `AlbumItem` and updates `AlbumStats.renderCount`.

This keeps album ingestion retry-safe and aligned with the current async design.

### 6.5 Reprocess And Frame Changes

Current images can later stage a different frame and call `POST /images/:id/reprocess`.

Production recommendation:

- album membership should be historical, not mutable by later private edits
- once an image is added to an album, the album item should represent the render state that qualified for the album at that moment
- therefore store `imageRenderRevision` on `AlbumItem` even if the initial public schema keeps it optional

If that column is omitted, public album views may unexpectedly change when contributors later edit the same underlying image.

### 6.6 Public Album Reads Must Reuse Existing Image Records

Album public responses should reuse:

- `images`
- `image_variants`
- `image_render_variants`
- `StorageService.generatePresignedGetUrl()`

They should not:

- duplicate variants
- copy image binaries into album-specific folders
- create separate thumbnail tables

### 6.7 Premium Frame Rule Must Remain Intact

Shared albums must not bypass premium frame access.

If an album references a premium frame:

- contributors still go through the existing frame entitlement logic
- free users must still be rejected by the existing premium check

Otherwise the album feature would become a premium-frame bypass.

## 7. Cache Strategy

### 7.1 Cache Service Pattern

The repository already uses:

- `CacheService` as the JSON wrapper
- Redis key versioning for list invalidation
- explicit cache services per domain (`FramesCacheService`, `ImagesCacheService`)

Album caching should follow the same pattern with a dedicated `AlbumsCacheService`.

### 7.2 Recommended Cache Keys

- `album:id:{id}`
- `album:shortcode:{shortCode}`
- `album:{id}:stats`
- `album:{id}:items:v{version}:{hash}`
- `albums:search:v{version}:{hash}`

### 7.3 Recommended TTLs

- album detail: `300s`
- album stats: `300s`
- album item lists: `120s`
- search results: `60s`

These TTLs are shorter than frame detail caches because album membership is expected to change more often than frame template metadata.

### 7.4 Invalidation Rules

On album creation:

- invalidate search cache
- set `album:id`
- set `album:shortcode`

On album item insertion:

- invalidate `album:id`
- invalidate `album:shortcode`
- bump `album:{id}:items:version`
- invalidate `album:{id}:stats`
- invalidate public search cache if search sorts by recent activity

On stats update:

- invalidate `album:{id}:stats`

### 7.5 Versioning Strategy

Follow the frame/image pattern:

- use a version key for search
- use a per-album item-list version key
- keep cached payloads immutable

This avoids pattern deletes for hot paths.

## 8. Queue Design (Optional)

### 8.1 Current Queue Reality

The current repository does not use RabbitMQ. It uses:

- BullMQ
- Redis-backed queue config
- queue constants in `src/common/queue/queue.constants.ts`

The Album Service should adopt the same transport in its first implementation.

If the broader platform later standardizes on RabbitMQ, introduce it as a deliberate platform migration, not as a one-off exception inside the album feature.

### 8.2 Recommended Queue Additions

Add:

- queue name: `album-events`
- job types:
  - `album.image.added`
  - `album.analytics.update`
  - `album.index.update`

Recommended constants:

```ts
export const ALBUM_EVENTS_QUEUE = 'album-events';

export enum AlbumJobType {
  ADD_IMAGE = 'album.image.added',
  UPDATE_ANALYTICS = 'album.analytics.update',
  UPDATE_INDEX = 'album.index.update',
}
```

### 8.3 Producers

- `ImageProcessingWorker` produces `album.image.added`
- public album read path may produce `album.analytics.update`
- future admin/backfill flows may produce `album.index.update`

### 8.4 Consumers

`AlbumsWorker` should:

- upsert album items
- increment stats
- invalidate caches
- optionally rebuild lightweight search projections

### 8.5 Idempotency Rules

Use both:

- DB unique constraint on `album_items(album_id, image_id)`
- deterministic `jobId`, for example `album-add-{albumId}-{imageId}`

This matches the retry-tolerant style already used in the image pipeline.

### 8.6 Why There Should Not Be A Separate Album Render Queue

The current system already renders framed outputs through `ImagesModule`.

Album should subscribe to render completion, not create a second rendering subsystem.

So:

- no album-specific renderer
- no album-specific storage keys
- no duplicate render workers

## 9. Security Design

### 9.1 Public Vs Private Albums

Recommended initial rule set:

- albums created by share are `isPublic = true`
- public album reads use `@Public()` plus optional auth
- private albums may be added later without changing the core model

### 9.2 Ownership Rules

- album owner is `Album.ownerId`
- contributor is `AlbumItem.userId`
- album owner controls album metadata and visibility
- contributors do not gain edit rights over the album
- image ownership remains `Image.userId`

### 9.3 Existing Auth Patterns To Reuse

Reuse the current codebase pattern:

- global `JwtAuthGuard`
- `CurrentUser` decorator
- `AdminGuard` for administrative routes
- `OptionalJwtGuard` for public reads that may later personalize

### 9.4 Internal Ingestion Security

`POST /albums/:id/images` should not be a normal client mutation path.

Safer options:

- internal service method only
- worker-only flow
- admin-protected operational endpoint if exposure is required

### 9.5 Image Exposure Rules

Public albums should not flip original images to anonymous public storage.

Instead:

- keep image originals private
- keep image render cache private
- expose only signed URLs at response time
- optionally expose only thumbnail/medium/large variants, never raw original URLs

### 9.6 Abuse Controls

Because image upload is already authenticated in the current codebase:

- public album contribution remains authenticated
- current auth throttling and daily upload limits still apply
- existing quota rules still apply

This is a strong alignment point with the current platform.

## 10. Performance Considerations

### 10.1 Pagination

Use the existing `PaginationService` conventions:

- default `page = 1`
- default `limit = 20`
- maximum `limit = 100`

### 10.2 Query Efficiency

Album detail reads should:

- fetch album row once
- fetch album items paginated by `album_id`
- batch-load images
- batch-load variants
- generate signed URLs in parallel

Avoid N+1 repository access for per-item image metadata.

### 10.3 Search Efficiency

Initial search should support:

- exact `shortCode`
- exact `frameId`
- exact `ownerId`
- optional creator text match

Future tag search should first join through frame tags. If album search volume grows, add a dedicated album search projection.

### 10.4 Write Efficiency

Album item population should be:

- async
- idempotent
- append-oriented

Avoid long transactions that span image processing and album insertion.

### 10.5 Storage Efficiency

Albums should not create new media files, so:

- no new quota consumption for album membership itself
- no duplicate thumbnails
- no additional object lifecycle complexity

### 10.6 Analytics Efficiency

For public album views:

- count views asynchronously
- aggregate in Redis when traffic increases
- flush to Postgres on schedule if needed

This mirrors the existing frame popularity pattern.

## 11. Database Indexing

Recommended indexes:

### Albums

- unique `shortCode`
- index `frameId`
- index `ownerId`
- index `(isPublic, createdAt)`
- unique `(ownerId, frameId)` if one share album per owner/frame is desired

### AlbumItems

- unique `(albumId, imageId)`
- index `(albumId, createdAt DESC)`
- index `imageId`
- index `userId`
- index `frameId`

### AlbumStats

- PK `albumId`

### Supporting Existing Tables

Add:

- `images.album_id`
- `upload_sessions.album_id`

These supporting indexes are mandatory for efficient ingestion and lookup.

## 12. NestJS Module Structure

Recommended structure:

```text
src/albums/
  controllers/
    albums.controller.ts
    albums-admin.controller.ts
  services/
    albums.service.ts
    albums-cache.service.ts
    album-search.service.ts
    short-code.service.ts
  entities/
    album.entity.ts
    album-item.entity.ts
    album-stats.entity.ts
  dto/
    create-album.dto.ts
    query-albums.dto.ts
    add-album-image.dto.ts
    query-album-images.dto.ts
  workers/
    albums.worker.ts
  guards/
    album-owner.guard.ts
  albums.module.ts
```

Additional cross-cutting changes:

```text
src/common/queue/queue.constants.ts
src/common/queue/queue.module.ts
src/database/migrations/
src/images/dto/request-upload-url.dto.ts
src/images/entities/image.entity.ts
src/images/entities/upload-session.entity.ts
src/images/services/upload.service.ts
src/images/workers/image-processing.worker.ts
```

Module dependency recommendation:

- `AlbumsModule` may import `FramesModule`
- `AlbumsModule` should use repositories plus shared services for image reads to avoid circular service dependencies
- `ImagesModule` should reference album IDs/entities at the persistence edge, not by calling `AlbumsService` directly

This keeps the module graph manageable.

## 13. Integration Flow Diagrams

### 13.1 Frame -> Share -> Album

```text
User clicks Share
  -> POST /api/v1/albums { frameId }
  -> AlbumsService validates frame via existing frame entitlement rules
  -> AlbumsService finds-or-creates Album(ownerId, frameId)
  -> shortCode generated
  -> AlbumStats row created
  -> cache primed / search invalidated
  -> response returns shortCode + share URL
```

Important mapping:

- product language: "frame becomes public"
- implementation reality in this repo: "album/publication becomes public"

### 13.2 Image -> Render -> Album

```text
Public user opens /albums/:shortCode
  -> client requests upload session with albumShortCode
  -> UploadService resolves album -> albumId + frameId
  -> upload_sessions row saved with albumId + frameId

Client completes upload
  -> UploadService creates images row with albumId + frameId
  -> existing image-processing queue handles variants/render state

ImageProcessingWorker completes successfully
  -> enqueue album.image.added { albumId, imageId, frameId, userId }
  -> AlbumsWorker upserts AlbumItem
  -> AlbumStats.renderCount increments
  -> album cache invalidated
```

### 13.3 Search Flow

```text
GET /api/v1/albums/search
  -> AlbumsService checks cache
  -> query albums filtered by public visibility
  -> optional joins: owner, frame, frame tags
  -> paginated response cached
```

## 14. Implementation Phases

### Phase 1: Entities And Migrations

Deliverables:

- create `albums`, `album_items`, `album_stats`
- add `album_id` to `upload_sessions`
- add `album_id` to `images`
- add indexes/FKs
- add queue constants for album jobs
- add `ShortCodeService`

### Phase 2: APIs And Read Model

Deliverables:

- `POST /albums`
- `GET /albums/:shortCode`
- `GET /albums/search`
- `GET /albums/:id/images`
- `AlbumsCacheService`
- public response assembler using existing image/frame data

### Phase 3: Image Pipeline Integration

Deliverables:

- `albumShortCode` support in upload request flow
- `albumId` persistence in upload session and image record
- image-processing completion hook
- `AlbumsWorker` ingestion logic
- stats increment and cache invalidation

### Phase 4: Optimization And Hardening

Deliverables:

- analytics queueing
- creator search optimization
- future tag search via frame tags
- operational admin endpoints
- backfill script for any historical images that should map into albums
- dashboards/logging/alerts

## 15. Acceptance Criteria

The Album Service is production-ready when all of the following are true:

1. A signed-in user can share a frame experience and receive a stable `shortCode`.
2. The share action does not mutate the global `frames` catalog semantics.
3. Repeated share by the same owner for the same frame is idempotent.
4. A public album can be fetched by `shortCode`.
5. Uploads started from a shared album persist album context from request to image record.
6. Completed image processing automatically adds the image to the correct album without duplicating image storage.
7. Album ingestion is retry-safe and idempotent.
8. Public album responses use signed URLs generated from existing image variant records.
9. Premium frame entitlement is still enforced for contributors.
10. Cache keys, TTLs, and invalidation follow current repository conventions.
11. Queue jobs follow current BullMQ conventions and do not introduce RabbitMQ-only assumptions.
12. Database indexes support `shortCode`, `frameId`, `ownerId`, and album item pagination.
13. E2E coverage proves:
    - share -> album create
    - shortCode lookup
    - upload via album context
    - async album population after processing
    - public album read
    - premium frame rejection for unauthorized contributors
14. Operational tooling exists for replaying failed album ingestion jobs.
15. No binary asset duplication is introduced anywhere in storage.

## Final Recommendation

The most important architectural decision is to implement albums as a new publication layer, not as a mutation of the current `Frame` template entity.

That single choice keeps the new service synchronized with the codebase that already exists:

- Auth keeps owning identity and route protection.
- Frames keep owning reusable template metadata and premium access.
- Images keep owning uploads, variants, render revisions, and storage.
- Albums own public discovery, share codes, gallery membership, and analytics.

That is the cleanest path to a production-grade Album Service in the current `frame-api` repository.
