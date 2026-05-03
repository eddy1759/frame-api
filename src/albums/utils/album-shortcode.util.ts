export const LEGACY_ALBUM_SHORT_CODE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{8}$/;
export const CUSTOM_ALBUM_SHORT_CODE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ALBUM_SHORT_CODE_MIN_LENGTH = 4;
export const ALBUM_SHORT_CODE_MAX_LENGTH = 32;

export function normalizeAlbumShortCode(input: string): string {
  let normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (normalized.length > ALBUM_SHORT_CODE_MAX_LENGTH) {
    normalized = normalized
      .slice(0, ALBUM_SHORT_CODE_MAX_LENGTH)
      .replace(/-+$/g, '');
  }

  return normalized;
}

export function normalizeAlbumShortCodeLookup(input: string): string {
  return input.trim().toLowerCase();
}

export function isLegacyAlbumShortCode(input: string): boolean {
  return LEGACY_ALBUM_SHORT_CODE_REGEX.test(input.trim());
}

export function isCustomAlbumShortCode(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.length >= ALBUM_SHORT_CODE_MIN_LENGTH &&
    trimmed.length <= ALBUM_SHORT_CODE_MAX_LENGTH &&
    CUSTOM_ALBUM_SHORT_CODE_REGEX.test(trimmed)
  );
}

export function isValidAlbumShortCode(input: string): boolean {
  const trimmed = input.trim();
  return isLegacyAlbumShortCode(trimmed) || isCustomAlbumShortCode(trimmed);
}
