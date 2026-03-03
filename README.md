# Frame API

NestJS backend for authentication, frame catalog management, SVG asset processing, caching, and popularity tracking.

## Table of Contents

- Overview
- Architecture
- Tech Stack
- Project Structure
- Prerequisites
- Local Setup
- Environment Variables
- Database and Migrations
- Running the API
- API Conventions
- Endpoint Map
- Auth, Roles, and Premium Access
- Frame Asset Upload Workflow
- Sample SVG Overlays
- Testing and Performance
- Troubleshooting

## Overview

This service provides:

- OAuth-based authentication and JWT session lifecycle
- Public frame browsing with filtering/search/pagination
- Admin frame/category/tag management
- Secure SVG upload and sanitization
- Generated PNG thumbnails from SVG assets
- Redis-backed caching and popularity counters
- Consistent API response envelope and error format

## Architecture

High-level flow:

1. API receives request at `api/v1/*`.
2. Global JWT guard protects routes by default.
3. `@Public()` routes bypass mandatory auth.
4. Frames module serves metadata; SVG endpoint returns URL only (no file proxy).
5. Redis is used for:
   - response cache keys
   - popularity sorted sets (`popular:frames:*`)
6. PostgreSQL stores durable entities and counters.
7. MinIO stores SVGs and thumbnails through S3-compatible SDK.

## Tech Stack

- NestJS 10
- TypeORM + PostgreSQL
- Redis (ioredis)
- AWS SDK v3 S3 client (MinIO-compatible)
- Sharp (thumbnail generation)
- Swagger/OpenAPI
- Jest + Supertest + k6

## Project Structure

Key folders:

- `src/auth`: auth module (OAuth login, token refresh, session management)
- `src/frames`: frames domain (controllers, services, entities, guards, cron)
- `src/common`: shared services, config, filters, interceptors, redis module
- `src/database/migrations`: SQL schema/data migrations
- `sample-svgs`: upload-ready frame overlay SVGs for manual testing
- `test`: e2e and performance scripts

## Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Generate JWT keys:

```bash
npm run keys:generate
```

3. Create env file:

```bash
cp .env.example .env
```

4. Ensure `.env` local values are aligned (especially ports and storage):

- `PORT=8000`
- `API_PREFIX=api/v1`
- `DB_HOST=localhost`
- `DB_PORT=5432`
- `REDIS_HOST=localhost`
- `REDIS_PORT=6382`
- `REDIS_PASSWORD=frame_redis_password_dev`
- `OBJECT_STORAGE_ENDPOINT=http://localhost:9000`
- `OBJECT_STORAGE_BUCKET=frame-assets`
- `CDN_BASE_URL=http://localhost:9000/frame-assets`

5. Start infra:

```bash
docker compose up -d
```

6. Run migrations:

```bash
npm run migration:run
```

7. Start API:

```bash
npm run start:dev
```

## Environment Variables

Validated by `src/common/config/env.validation.ts`.

Core runtime:

- `NODE_ENV` (`development|staging|production|test`)
- `PORT` (default `3000`, commonly `8000` locally)
- `HOST` (default `0.0.0.0`)
- `API_PREFIX` (recommended `api/v1`)

Database:

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `DB_POOL_MAX`, `DB_POOL_MIN`

Redis:

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

JWT:

- `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`
- `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`

OAuth:

- `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`

Security and HTTP:

- `ENCRYPTION_KEY`
- `THROTTLE_TTL`, `THROTTLE_LIMIT`
- `CORS_ORIGINS`
- `HTTP_KEEP_ALIVE_TIMEOUT`, `HTTP_HEADERS_TIMEOUT`, `HTTP_REQUEST_TIMEOUT`
- `HTTP_ACCESS_LOG_ENABLED`

Object storage/CDN:

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`
- `OBJECT_STORAGE_USE_SSL`
- `CDN_BASE_URL`

## Database and Migrations

Run:

```bash
npm run migration:run
npm run migration:show
```

Relevant schema includes:

- auth tables (`users`, `oauth_accounts`, `refresh_tokens`)
- frames domain (`frames`, `categories`, `tags`, `frame_assets`, junction tables, `user_saved_frames`)
- seed migrations for default categories and sample frames

## Running the API

Local URLs (assuming `PORT=8000`, `API_PREFIX=api/v1`):

- API base: `http://localhost:8000/api/v1`
- Swagger UI: `http://localhost:8000/api/docs` (non-production only)
- Health: `http://localhost:8000/api/v1/health`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

## API Conventions

Success response:

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

Error response:

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

## Auth, Roles, and Premium Access

- Global auth is enforced by `JwtAuthGuard`.
- `@Public()` routes are explicitly open.
- Admin routes require `role=admin`.
- `GET /frames/:id/svg` behavior:
  - free frame: public access
  - premium frame:
    - admin JWT allowed
    - or user JWT with `subscriptionActive=true`
    - otherwise `401`/`403`

## Frame Asset Upload Workflow

Endpoint:

- `POST /api/v1/admin/frames/:id/assets`

Pipeline:

1. Validate file presence and max size (5 MB)
2. Parse and sanitize SVG (strip risky tags/attrs/external refs)
3. Upload sanitized original SVG to object storage
4. Generate PNG thumbnails (150/300/600)
5. Upload thumbnails
6. Persist `frame_assets` rows
7. Update frame `svgUrl` and `thumbnailUrl`
8. Invalidate frame cache

Example upload:

```bash
curl -X POST "http://localhost:8000/api/v1/admin/frames/<frame-id>/assets" \
  -H "Authorization: Bearer <admin_jwt>" \
  -F "file=@sample-svgs/abstract.svg;type=image/svg+xml"
```

## Sample SVG Overlays

`sample-svgs/` includes 10 portrait upload-ready overlays:

- `abstract.svg`
- `birthday.svg`
- `graduation.svg`
- `holiday.svg`
- `movement.svg`
- `nature.svg`
- `political.svg`
- `religion.svg`
- `sports.svg`
- `wedding.svg`

Each file is designed as a frame overlay with transparent center window suitable for asset upload testing.

## Testing and Performance

Unit/integration:

```bash
npm run test
npm run test:e2e
npm run test:cov
```

Lint/build:

```bash
npm run lint:check
npm run build
```

Performance (k6):

```bash
npm run perf:frames:list
```

This uses `test/perf/run-frames-list.ps1` and `test/perf/frames-list.k6.js`.

## Troubleshooting

### 1) `STORAGE_UPLOAD_FAILED` on `/admin/frames/:id/assets`

Check MinIO reachability and ports:

- `docker compose ps`
- Ensure `frame-minio` shows `0.0.0.0:9000-9001->9000-9001/tcp`
- Health check: `http://localhost:9000/minio/health/live`

If ports are missing (stale container), recreate:

```bash
docker compose up -d --force-recreate minio minio-init
```

### 2) `(0 , sharp_1.default) is not a function`

Cause: stale runtime build/import mismatch for `sharp`.

Fix:

- ensure service imports `sharp` correctly (`import sharp = require('sharp')`)
- restart API after code update

### 3) `FRAME_NOT_FOUND` with message `Frame asset is not available.`

The frame exists but `svg_url` is null. Upload assets first via admin endpoint.

### 4) Redis `NOAUTH Authentication required`

Ensure `.env` and compose values match:

- `REDIS_PORT=6382`
- `REDIS_PASSWORD=frame_redis_password_dev`

### 5) Unexpected route paths

`API_PREFIX` is environment-driven. Recommended local value is `api/v1`.
If you set `v1`, all paths shift to `/v1/*`.

---

If the running behavior differs from this README, check current branch and local uncommitted changes first.
