# Frame API

NestJS backend for OAuth authentication, frame catalog management, private image ingestion, and a hybrid image rendering pipeline that combines canonical raw variants with revisioned composited frame renders.

## What This Service Owns

- OAuth login with Google and Apple, JWT access tokens, refresh-token rotation, and session management.
- Public and premium frame discovery, saved frames, category/tag taxonomy, and popularity tracking.
- Admin frame authoring, secure SVG ingestion, thumbnail generation, and editor preview generation.
- Private user image uploads with quota reservation, asynchronous processing, EXIF sanitization, and raw image variants.
- Staged frame and transform edits that are promoted through explicit reprocess operations.
- Revisioned framed render caching with read-through fallback to raw variants when a composited asset is missing.

## Companion Docs

- [Hybrid image and frame rendering design](./docs/hybrid-image-frame-rendering.md)
- [Playground frontend README](../frame-api-playground/README.md)

## Architecture At A Glance

```text
Clients / Playground
        |
        v
NestJS API (auth, frames, images, health)
        |
        +--> PostgreSQL
        |     - users, oauth accounts, refresh tokens
        |     - frames, categories, tags, frame assets, saved frames
        |     - images, upload sessions, raw variants, render variants
        |
        +--> Redis
        |     - JWT session presence and session sets
        |     - response caches and list version counters
        |     - frame popularity sorted sets
        |     - render single-flight locks
        |
        +--> BullMQ
        |     - raw image processing jobs
        |     - framed render prewarm jobs
        |
        +--> S3-compatible object storage (MinIO locally)
              - public frame assets under frames/*
              - private image uploads, variants, snapshots, and renders
```

## Core Runtime Model

- Authentication is global by default through `JwtAuthGuard`; routes must opt out with `@Public()`.
- Public frame routes can still accept an optional access token to return user-aware data such as `isSaved`.
- Premium raw frame asset access is guarded separately from frame detail metadata.
- Image uploads are two-step:
  1. Request a presigned PUT URL and reserve quota.
  2. Confirm completion so the API validates the object, creates the image row, snapshots any selected frame, and queues processing.
- Raw image variants are generated first and remain the source of truth.
- Framed variants are generated on demand or prewarmed and stored per render revision.

## Project Layout

| Path                      | Purpose                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `src/auth`                | OAuth providers, JWT guards/strategy, session lifecycle, profile endpoints                  |
| `src/frames`              | Frame catalog, categories, tags, SVG asset pipeline, premium gating, popularity sync        |
| `src/images`              | Upload sessions, raw variant processing, quota tracking, staged frame edits, render caching |
| `src/common`              | Config, Redis, BullMQ setup, shared services, response/error infrastructure                 |
| `src/database/migrations` | Additive schema and seed migrations                                                         |
| `sample-svgs`             | Local frame overlay SVG fixtures used by sample frame tooling                               |
| `scripts`                 | Key generation, sample asset repair, token/seed helpers                                     |
| `test`                    | Auth, frames, and image e2e coverage plus perf scripts                                      |
| `docs`                    | Design and operational notes                                                                |

## Local Dependencies

| Dependency    | Local default           | Notes                                  |
| ------------- | ----------------------- | -------------------------------------- |
| Node.js       | 20+                     | Required for NestJS build/runtime      |
| PostgreSQL    | `localhost:5432`        | Database `frame_db`, user `frame_user` |
| Redis         | `localhost:6382`        | Cache/session Redis with password auth |
| MinIO API     | `http://localhost:9000` | S3-compatible object storage           |
| MinIO Console | `http://localhost:9001` | Local bucket inspection                |

The repo ships a local `docker-compose.yml` that starts PostgreSQL, Redis, MinIO, and a MinIO bootstrap container that:

- creates the `frame-assets` bucket
- exposes `frames/*` as publicly downloadable
- adds a 1-day lifecycle rule for `tmp/*`

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy the env template:

```bash
cp .env.example .env
```

3. Generate JWT keys:

```bash
npm run keys:generate
```

4. Start local infrastructure:

```bash
docker compose up -d
```

5. Check migration state if you want to inspect the schema explicitly:

```bash
npm run migration:show
```

6. Start the API:

```bash
npm run start:dev
```

7. Open the local surfaces:

- API base: `http://localhost:8000/api/v1`
- Swagger: `http://localhost:8000/api/docs`
- Health: `http://localhost:8000/api/v1/health`
- Playground frontend: see `../frame-api-playground`

## Local Environment Reference

The main validated env surface lives in `src/common/config/env.validation.ts`. Two low-level runtime knobs are also read directly by config modules: `DB_SSL` and `REDIS_DB`.

### App and HTTP

- `NODE_ENV`: `development`, `staging`, `production`, or `test`
- `PORT`: API port, commonly `8000` locally
- `HOST`: bind host, defaults to `0.0.0.0`
- `API_PREFIX`: recommended `api/v1`
- `CORS_ORIGINS`: comma-separated browser origins
- `HTTP_KEEP_ALIVE_TIMEOUT`
- `HTTP_HEADERS_TIMEOUT`
- `HTTP_REQUEST_TIMEOUT`
- `HTTP_ACCESS_LOG_ENABLED`

### Database

- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_POOL_MAX`
- `DB_POOL_MIN`
- `DB_AUTO_RUN_MIGRATIONS`
- `DB_SSL`: used by `database.config.ts` for TLS enablement

Development note:

- `DB_AUTO_RUN_MIGRATIONS` defaults to `true` in `development`.
- In non-development environments, migrations stay manual unless you opt in by setting `DB_AUTO_RUN_MIGRATIONS=true`.

### Redis and Queueing

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`: base Redis DB for cache/session data
- `REDIS_QUEUE_HOST`
- `REDIS_QUEUE_PORT`
- `REDIS_QUEUE_PASSWORD`
- `REDIS_QUEUE_DB`
- `REDIS_QUEUE_NAME`
- `QUEUE_ATTEMPTS`
- `QUEUE_BACKOFF_DELAY`
- `QUEUE_REMOVE_ON_COMPLETE_AGE`
- `QUEUE_REMOVE_ON_COMPLETE_COUNT`
- `QUEUE_REMOVE_ON_FAIL_AGE`

### JWT and OAuth

- `JWT_PRIVATE_KEY_PATH`
- `JWT_PUBLIC_KEY_PATH`
- `JWT_ACCESS_TOKEN_TTL`
- `JWT_REFRESH_TOKEN_TTL`
- `GOOGLE_CLIENT_ID`
- `APPLE_CLIENT_ID`

Only the OAuth client identifiers are consumed by the provider implementations in this repo.

### Storage and Image Processing

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`
- `OBJECT_STORAGE_USE_SSL`
- `CDN_BASE_URL`
- `PRESIGNED_URL_EXPIRY`
- `IMAGE_MAX_SIZE`
- `IMAGE_DAILY_UPLOAD_LIMIT`
- `IMAGE_DEFAULT_STORAGE_LIMIT`
- `IMAGE_SOFT_DELETE_GRACE_DAYS`

## Local Storage Layout

Common object key patterns used by the codebase:

- `tmp/<userId>/<year>/<month>/<imageId>.<ext>`: temporary upload-session object
- `images/<userId>/<year>/<month>/<imageId>.<ext>`: canonical original image
- `images/<userId>/<year>/<month>/<imageId>_<variant>.jpg`: raw image variants
- `frames/<frameId>/original.svg`: sanitized frame SVG
- `frames/<frameId>/thumbnail-*.png`: frame thumbnails
- `frames/<frameId>/editor-preview.png`: editor overlay preview
- `image-frame-snapshots/<imageId>/rev-<n>/frame.svg`: per-image frame snapshot
- `image-renders/<imageId>/rev-<n>/<variant>.jpg`: composited framed variants

Public vs private:

- Frame assets under `frames/*` are intended to be publicly downloadable through the configured CDN/base URL.
- Image originals, raw variants, snapshots, and composited renders are served through presigned GET URLs.

## Auth And Authorization Model

- `JwtAuthGuard` is registered globally through `APP_GUARD`.
- `@Public()` bypasses mandatory auth.
- `OptionalJwtGuard` attaches a user on public frame routes when a valid access token is present.
- `AdminGuard` restricts admin routes to `role=admin`.
- `PremiumFrameGuard` protects premium raw frame asset endpoints:
  - admin access is allowed
  - subscribed users are allowed
  - unauthenticated users get `401`
  - authenticated but unsubscribed users get `403`

Session behavior:

- access tokens are signed with RS256
- refresh tokens are stored hashed in PostgreSQL
- active session presence is tracked in Redis
- refresh-token reuse triggers family-wide revocation and session invalidation

## API Contract Conventions

All successful responses are wrapped by `TransformInterceptor`:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601"
  }
}
```

Errors are normalized by `GlobalExceptionFilter`:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "statusCode": 400
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601"
  }
}
```

Operational notes:

- `x-request-id` is accepted from the caller or generated automatically.
- Swagger is mounted at `/api/docs`.
- `GET /health/jwt-test` is a diagnostic route intended for development checks.

## Endpoint Map

All routes below are relative to `${API_PREFIX}` unless noted otherwise.

### Health

- `GET /health`
- `GET /health/jwt-test`

### Auth

- `POST /auth/google`
- `POST /auth/apple`
- `POST /auth/refresh`
- `GET /auth/me`
- `PUT /auth/me`
- `DELETE /auth/me`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:sessionId`

### Public And User Frame Routes

- `GET /frames`
- `GET /frames/popular`
- `GET /frames/saved`
- `GET /frames/slug/:slug`
- `GET /frames/:id`
- `GET /frames/:id/svg`
- `GET /frames/:id/editor-preview`
- `POST /frames/:id/apply`
- `POST /frames/:id/save`
- `DELETE /frames/:id/save`
- `GET /frames/categories`
- `GET /frames/categories/:slug`
- `GET /frames/tags`

### Frame Admin

- `POST /admin/frames`
- `PUT /admin/frames/:id`
- `DELETE /admin/frames/:id`
- `POST /admin/frames/:id/assets`
- `POST /admin/frames/categories`
- `GET /admin/frames/categories`
- `PUT /admin/frames/categories/:id`
- `DELETE /admin/frames/categories/:id`
- `POST /admin/frames/tags`
- `GET /admin/frames/tags`
- `PUT /admin/frames/tags/:id`
- `DELETE /admin/frames/tags/:id`

### User Image Routes

- `POST /images/upload-url`
- `POST /images/:id/complete`
- `GET /images/upload-sessions/:id`
- `POST /images/upload-sessions/:id/cancel`
- `GET /images/storage`
- `POST /images/batch`
- `GET /images`
- `GET /images/:id`
- `GET /images/:id/processing-status`
- `PATCH /images/:id`
- `POST /images/:id/reprocess`
- `DELETE /images/:id`

### Image Admin

- `GET /admin/images/stats`
- `POST /admin/images/:id/reprocess`
- `DELETE /admin/images/:id/hard`
- `GET /admin/images/orphaned`
- `POST /admin/images/cleanup`

## Frame Catalog And Asset Workflow

Frame authoring is metadata-first:

1. Admin creates a frame record with dimensions, aspect ratio, orientation, premium flags, sort order, and optional `metadata.imagePlacement`.
2. Admin uploads an SVG asset.
3. The API sanitizes the SVG, rejects risky markup, validates the canvas aspect ratio against the frame record, and stores the cleaned SVG.
4. The API generates:
   - thumbnail small, medium, and large PNGs
   - editor preview PNG
   - `FrameAsset` rows for each stored asset
5. The frame entity is updated with `svgUrl`, `thumbnailUrl`, and `editorPreviewUrl`.

Important behavior:

- Frame detail payloads hide premium raw asset URLs from public detail responses.
- Premium raw access is routed through guarded endpoints instead.
- `metadata.imagePlacement` defines the normalized photo window used later by image compositing.

## Image Upload, Processing, And Editing Workflow

### 1. Upload session creation

- `POST /images/upload-url`
- validates MIME type and declared file size
- checks the user's daily upload limit from upload-session records
- optionally validates premium frame eligibility
- reserves pending quota
- returns a presigned PUT URL for temporary storage

### 2. Upload completion

- `POST /images/:id/complete`
- verifies the uploaded object exists and matches expectations
- detects actual image type server-side
- verifies optional checksum
- snapshots the selected frame SVG if a frame was chosen
- creates the `images` row and marks it `uploaded`
- queues asynchronous raw processing

### 3. Raw processing worker

- stores the original image as the canonical source object
- extracts and sanitizes EXIF metadata
- computes dimensions, aspect ratio, and orientation
- generates raw variants such as `thumbnail`, `medium`, `large`, and `panoramic_preview` for eligible 360 images
- updates quota accounting for created variants
- queues framed render prewarm when an active frame snapshot exists

### 4. Staged edit model

- `PATCH /images/:id` can stage a frame change, frame removal, or transform change
- staged edits do not replace the active frame render immediately
- `frameRenderStatus` communicates whether the image is ready, has no frame, or needs reprocess

### 5. Promotion and prewarm

- `POST /images/:id/reprocess` promotes staged changes
- promotion increments `activeRenderRevision`
- framed render prewarm is queued after promotion

See [the dedicated hybrid rendering document](./docs/hybrid-image-frame-rendering.md) for the full data flow and state model.

## The Hybrid Rendering Strategy

The image system deliberately keeps two representations alive:

- Canonical raw outputs: original plus standard raw variants produced by the image worker.
- Derived framed outputs: revisioned composited variants produced only when a frame is active.

Why this matters:

- the system can always fall back to raw variants if framed renders are missing
- frame edits can be staged and promoted safely
- old framed revisions can be cleaned without touching the original image
- clients can rehydrate the editor with `renderTransform`, `pendingRenderTransform`, and `activeRenderRevision`

## Background Jobs, Cron, And Warmups

### BullMQ jobs

- `process-image`: generate raw image variants after upload completion
- `prewarm-frame-render`: generate framed variants for the active revision

### Scheduled tasks

- every 10 minutes: expire upload sessions and reclaim pending quota
- every 15 minutes: requeue stalled uploaded images
- every 15 minutes: sync frame popularity counters from Redis into PostgreSQL
- daily at 2 AM: hard-delete expired soft-deleted images and clean stale framed render variants
- daily at 3 AM: reconcile per-user storage quota against actual stored bytes

### Startup behavior

- frame taxonomy and popular frame caches are warmed on application bootstrap
- development startup auto-runs pending migrations unless disabled

## Caching And Counters

Redis is used for more than simple response caching:

- frame detail, frame lists, categories, tags, and popular-frame caches
- processing-status cache plus image invalidation/version helpers
- frame popularity sorted sets:
  - `popular:frames:views`
  - `popular:frames:applies`
- render generation locks to avoid duplicate framed variant work

The cache layer is tolerant of Redis failures; cache misses degrade to database or storage reads instead of taking the API down.

## Scripts And Commands

### Core runtime

- `npm run start:dev`
- `npm run build`
- `npm run start:prod`

### Database

- `npm run migration:show`
- `npm run migration:run`
- `npm run migration:revert`

### Testing

- `npm test`
- `npm run test:e2e`
- `npm run lint:check`
- `npm run format:check`

### Utilities

- `npm run keys:generate`
- `npm run frames:generate-svgs`
- `npm run frames:repair-samples`
- `npm run perf:frames:list`

## Testing Strategy

The repo already has focused coverage for:

- auth login, refresh, and session flows
- frame browsing, premium access, admin CRUD, and asset upload
- full image upload, frame staging, transform staging, reprocess, and render exposure flows
- render math and frame metadata utilities

Relevant suites live in:

- `test/auth.e2e-spec.ts`
- `test/frames.e2e-spec.ts`
- `test/frames-flow.e2e-spec.ts`
- `test/frames-admin.e2e-spec.ts`
- `test/images-flow.e2e-spec.ts`
- `src/images/utils/__tests__`
- `src/frames/services/__tests__`
- `src/frames/utils/__tests__`

## Troubleshooting

### API fails at startup because keys are missing

Run:

```bash
npm run keys:generate
```

Then verify `JWT_PRIVATE_KEY_PATH` and `JWT_PUBLIC_KEY_PATH`.

### A frame query fails with a missing database column

Check migration state:

```bash
npm run migration:show
```

Development mode auto-runs pending migrations by default, but stale shells or alternate databases can still drift.

### Upload completion succeeds but processing never finishes

Check:

- Redis/queue connectivity
- worker logs for `ImageProcessingWorker`
- `GET /images/:id/processing-status`
- `POST /admin/images/cleanup` for stalled upload recovery

### Framed image URLs are returning raw variants

That usually means one of these is true:

- the image has no active frame snapshot
- the active framed render variant has not been generated yet
- the system fell back intentionally and queued a prewarm job

The behavior is expected in this hybrid model; the dedicated rendering doc explains the fallback path.

### Premium frame asset access returns `401` or `403`

- `401`: missing or invalid JWT
- `403`: authenticated user lacks an active subscription and is not an admin

### Sample frame overlays look wrong after metadata changes

Run:

```bash
npm run frames:repair-samples
```

This regenerates the local sample SVG assets used for seeded frame examples.

## Related Files To Read Next

- `src/main.ts`
- `src/app.module.ts`
- `src/auth/auth.service.ts`
- `src/frames/services/frames.service.ts`
- `src/frames/services/frame-assets.service.ts`
- `src/images/services/upload.service.ts`
- `src/images/services/images.service.ts`
- `src/images/services/image-compositing.service.ts`
- `src/images/workers/image-processing.worker.ts`
- `src/images/workers/upload-cleanup.worker.ts`
