# Hybrid Image And Frame Rendering

This document explains how the image pipeline combines canonical raw image variants with revisioned framed render variants. The goal is to support fast reads, safe staging, deterministic editor rehydration, and resilient fallback behavior without making framed compositing the only source of truth.

## Why The Pipeline Is Hybrid

The system intentionally keeps two asset families:

- Raw image assets:
  - original image
  - thumbnail
  - medium
  - large
  - panoramic preview for eligible 360 images
- Framed render assets:
  - thumbnail
  - medium
  - large
  - panoramic preview when the image is 360

Raw variants are always canonical because they come directly from the uploaded image. Framed variants are derived cache outputs that can be regenerated from:

- the original image
- a snapshotted frame SVG
- the snapshotted frame placement window
- the persisted render transform

That split gives the API three important guarantees:

1. Reads can fall back to raw variants if a framed render is missing.
2. Frame changes can be staged and promoted without mutating the original image.
3. Old framed revisions can be deleted aggressively while the core image remains intact.

## The Main Building Blocks

### Frame-side inputs

Frame authoring produces the inputs needed for later image compositing:

- frame metadata includes optional `metadata.imagePlacement`
- SVG uploads are sanitized and aspect-ratio validated
- SVGs must define a usable canvas; in practice a `viewBox` is the safest option and the local frame generator scripts emit one explicitly
- the frame service stores:
  - `original.svg`
  - thumbnail PNGs
  - `editor-preview.png`

The normalized `imagePlacement` window tells the renderer where the photo should appear inside the frame canvas.

Example placement object:

```json
{
  "version": 1,
  "fit": "cover",
  "window": {
    "x": 0.125,
    "y": 0.1111,
    "width": 0.75,
    "height": 0.7778
  }
}
```

### Image-side persisted state

The `images` table stores both active and staged render state:

- `frame_id`
- `frame_snapshot_key`
- `frame_snapshot_size`
- `frame_placement`
- `render_transform`
- `pending_frame_id`
- `pending_frame_snapshot_key`
- `pending_frame_snapshot_size`
- `pending_frame_placement`
- `pending_render_transform`
- `frame_render_status`
- `active_render_revision`

Framed outputs themselves live in `image_render_variants`.

## Render State Model

`frame_render_status` has three meaningful states:

- `none`: no active frame is attached
- `ready`: an active frame snapshot exists and the current render revision is authoritative
- `pending_reprocess`: the image has a staged frame or transform change that has not been promoted yet

`active_render_revision` is the version stamp for framed outputs. Each promotion or forced frame refresh increments the revision.

## Upload-Time Flow

### 1. Request upload URL

`POST /images/upload-url` does all of this before any bytes are processed:

- validates declared MIME type and file size
- checks the daily upload limit
- optionally validates the selected frame against the user's premium entitlement
- reserves pending quota
- creates an `UploadSession`
- returns a presigned PUT URL for temporary storage

At this point there is no image record yet, only an upload session and a temporary object key.

### 2. Complete upload

`POST /images/:id/complete` turns the session into a real image:

- verifies the temporary object exists
- reads the object and inspects its actual image format
- verifies optional SHA-256 checksum
- rejects a render transform if no frame is attached
- snapshots the selected frame SVG if a frame was chosen
- writes the initial `images` row
- queues raw image processing

If a frame is attached at upload completion, the image starts with:

- `frame_id = selected frame`
- `frame_snapshot_key = image-frame-snapshots/<imageId>/rev-1/frame.svg`
- `frame_render_status = ready`
- `active_render_revision = 1`

The snapshot matters because future frame edits in the catalog should not silently rewrite already-created user images.

## Raw Image Processing Flow

The raw worker runs first and remains foundational even for framed images.

`ImageProcessingWorker`:

- reads the original object from temporary or permanent storage
- auto-orients the image for width and height calculations
- extracts a safe subset of EXIF metadata
- validates 360 uploads heuristically
- copies the original into its permanent storage key if necessary
- creates the `original` variant record
- generates standard raw JPEG variants from the image
- stores width, height, aspect ratio, orientation, and `thumbnailUrl`

After the raw variants are written, the worker checks whether the image has an active frame snapshot. If it does, it queues framed render prewarm.

## The Render Transform Model

Transforms are deterministic and normalized.

Stored shape:

```json
{
  "version": 1,
  "zoom": 1.25,
  "offsetX": 0.18,
  "offsetY": -0.12,
  "rotation": 0
}
```

Important constraints:

- `zoom`: `1` to `6`
- `offsetX` and `offsetY`: `-1` to `1`
- `rotation`: `-180` to `180`
- values are rounded to 6 decimal places

Meaning:

- `zoom` is applied on top of the minimum cover scale needed to fill the frame window
- offsets are normalized movement within the legal translated range
- rotation is applied after scaling around the image center

If no transform is stored, the renderer uses a centered legacy default:

- `zoom = 1`
- `offsetX = 0`
- `offsetY = 0`
- `rotation = 0`

## How Composition Actually Works

For a renderable variant type such as `thumbnail`, `medium`, `large`, or `panoramic_preview`, the compositor:

1. loads the original image buffer
2. loads the active frame snapshot SVG buffer
3. reads the SVG canvas dimensions
4. resolves the output size for the target variant while preserving the frame aspect ratio
5. converts normalized frame placement into a pixel placement window
6. resolves the transform placement math for zoom, offsets, and rotation
7. rasterizes the transformed image into the placement window
8. rasterizes the SVG snapshot as an overlay
9. composites overlay over the placed photo
10. flattens to JPEG and writes the render object

This means the frame aspect ratio, not the raw photo aspect ratio, defines the output canvas when a framed render is generated.

## Why The Snapshot Is SVG, Not Just A Frame ID

Storing only a frame ID would make historical user images mutable when an admin changes a frame asset later. The snapshot approach prevents that:

- a user image always points at the exact frame SVG revision it was rendered against
- reprocess can intentionally refresh the snapshot when the user or admin wants the latest frame asset
- historical framed renders can be regenerated from the snapshotted SVG even if the original frame catalog entry changes again later

## Staged Edit Flow

`PATCH /images/:id` does not immediately swap active renders.

### Staging a new frame

When the user chooses another frame:

- the API copies the target frame SVG into `pending_frame_snapshot_key`
- persists `pending_frame_id`
- stores the pending placement snapshot
- clears any pending transform unless a new transform is supplied
- sets `frame_render_status = pending_reprocess`

### Staging frame removal

When the user removes the frame:

- pending snapshot state is cleared
- active frame stays live until promotion
- `frame_render_status` moves to `pending_reprocess`

### Staging a transform change

When the user changes crop/zoom/rotation:

- the API normalizes the transform
- compares it to the current active or staged baseline
- stores it in `pending_render_transform` only if it actually changes behavior
- keeps the active rendered experience stable until reprocess

This makes client editors predictable: the user can stage visual changes without racing the currently live image detail response.

## Promotion Flow

`POST /images/:id/reprocess` is the promotion boundary.

There are several cases:

### Promote pending frame change

- active snapshot becomes the pending snapshot
- pending fields are cleared
- `render_transform` becomes `pending_render_transform`
- `active_render_revision` increments
- framed prewarm is queued

### Promote pending transform only

- active snapshot is unchanged
- `render_transform` becomes `pending_render_transform`
- `active_render_revision` increments
- framed prewarm is queued

### Promote frame removal

- active frame fields are cleared
- active transform is cleared
- `frame_render_status` becomes `none`
- raw variants remain the live outputs

### Refresh current active frame snapshot

If there is already an active frame and no staged change, reprocess can still:

- copy the latest frame SVG into a new active snapshot revision
- update the stored placement snapshot
- increment `active_render_revision`
- queue prewarm

This is the explicit "pick up current frame asset changes" path.

## Read Path And Fallback Behavior

The hybrid design is most visible in reads.

### Thumbnail reads

For `thumbnailUrl`, the API:

- tries the framed render variant when the image has an active frame render state
- falls back to the raw thumbnail variant if the framed output does not exist yet

### Variant reads

For the `variants` object, the API:

- always serves `original` from the raw variant family
- tries framed variants only for renderable types
- falls back to raw variants if the framed output is missing
- queues a prewarm job if any expected framed output is absent

This behavior means the user never waits on render generation to see a usable image response.

## Single-Flight Render Generation

Framed render generation is protected with Redis locks so multiple requests do not render the same image revision and variant at once.

Lock key pattern:

```text
image:render:lock:<imageId>:rev:<revision>:<variantType>
```

The service:

- checks whether the render variant already exists
- acquires the Redis lock if needed
- rechecks once inside the lock
- generates the framed variant
- releases the lock only if the stored token still matches

## Storage Key Conventions

### Temporary upload object

- `tmp/<userId>/<year>/<month>/<imageId>.<ext>`

### Raw image family

- original: `images/<userId>/<year>/<month>/<imageId>.<ext>`
- raw variants: `images/<userId>/<year>/<month>/<imageId>_<variant>.jpg`

### Frame snapshot family

- `image-frame-snapshots/<imageId>/rev-<revision>/frame.svg`

### Framed render family

- `image-renders/<imageId>/rev-<revision>/<variant>.jpg`

These prefixes let the cleanup job delete old framed revisions without touching the canonical image or the active snapshot.

## Queue And Cron Responsibilities

### BullMQ responsibilities

- process uploaded images into raw variants
- prewarm framed variants after upload or promotion

### Cron responsibilities

- expire stale upload sessions and release reserved quota
- requeue uploads stuck in `uploaded`
- hard-delete soft-deleted images after the grace period
- remove framed render variants from older revisions
- reconcile quota with actual stored bytes

Quota reconciliation includes:

- original image size
- active and pending frame snapshot sizes
- raw image variant sizes except the original duplicate count rule already handled separately
- framed render variant sizes

## Failure Modes And Graceful Degradation

### Missing framed render variant

Result:

- the API serves the raw variant
- queues framed prewarm in the background

### Stale or changed frame catalog asset

Result:

- existing user images keep using their stored snapshot
- explicit reprocess is required to adopt the latest frame asset

### Interrupted upload completion

Result:

- session state is marked failed or expired
- reserved quota is released
- temporary storage objects are cleaned

### Stalled raw processing

Result:

- cleanup cron can requeue images stuck in `uploaded`

## Client Integration Notes

If you are building a client editor or a frontend integration, treat these fields as first-class state:

- `frameId`
- `pendingFrameId`
- `frameRenderStatus`
- `activeRenderRevision`
- `renderTransform`
- `pendingRenderTransform`

Recommended client behavior:

1. Use `renderTransform` to hydrate the active editor state.
2. Send staged changes through `PATCH /images/:id`.
3. Use `pendingRenderTransform` and `frameRenderStatus` to show unsaved visual changes.
4. Call `POST /images/:id/reprocess` to promote them.
5. Keep using returned URLs immediately; the API will fall back to raw variants until framed renders are ready.

## Files That Define This Design

- `src/images/services/upload.service.ts`
- `src/images/services/images.service.ts`
- `src/images/services/image-compositing.service.ts`
- `src/images/workers/image-processing.worker.ts`
- `src/images/workers/upload-cleanup.worker.ts`
- `src/images/utils/render-transform.util.ts`
- `src/images/utils/framed-render.util.ts`
- `src/frames/services/frame-assets.service.ts`
- `src/frames/utils/frame-metadata.util.ts`
- `src/images/entities/image.entity.ts`
- `src/images/entities/image-render-variant.entity.ts`
