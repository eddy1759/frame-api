import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { BusinessException } from '../../common/filters/business.exception';
import { SlugService } from '../../common/services';
import {
  ALBUM_SHORT_CODE_MAX_LENGTH,
  ALBUM_SHORT_CODE_MIN_LENGTH,
  isValidAlbumShortCode,
  normalizeAlbumShortCode,
} from '../utils/album-shortcode.util';

@Injectable()
export class ShortCodeService {
  private readonly alphabet =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  private readonly length = 8;

  constructor(private readonly slugService: SlugService) {}

  generate(): string {
    return Array.from(
      { length: this.length },
      () => this.alphabet[randomInt(0, this.alphabet.length)],
    ).join('');
  }

  normalizeCustomShortCode(input: string): string {
    return normalizeAlbumShortCode(input);
  }

  isValidShortCode(input: string): boolean {
    return isValidAlbumShortCode(input);
  }

  async generateUnique(
    exists: (shortCode: string) => Promise<boolean>,
    maxAttempts = 10,
  ): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = this.generate();
      if (!(await exists(candidate))) {
        return candidate;
      }
    }

    throw new BusinessException(
      'ALBUM_SHORT_CODE_GENERATION_FAILED',
      'Unable to generate a unique album short code.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async generateUniqueFromName(
    input: string,
    exists: (shortCode: string) => Promise<boolean>,
  ): Promise<string> {
    const preferred = this.toPreferredShortCode(input);

    if (!preferred) {
      return this.generateUnique(exists);
    }

    let candidate = preferred;
    let suffix = 2;

    while (await exists(candidate)) {
      const suffixText = `-${suffix}`;
      const maxBaseLength = ALBUM_SHORT_CODE_MAX_LENGTH - suffixText.length;
      const trimmedBase = preferred.slice(0, maxBaseLength).replace(/-+$/g, '');

      candidate = `${trimmedBase || 'album'}${suffixText}`;
      suffix += 1;
    }

    return candidate;
  }

  private toPreferredShortCode(input: string): string {
    const slug = this.slugService.toSlug(input);
    const normalized = normalizeAlbumShortCode(slug);

    if (!normalized) {
      return '';
    }

    if (normalized.length < ALBUM_SHORT_CODE_MIN_LENGTH) {
      return normalized.padEnd(ALBUM_SHORT_CODE_MIN_LENGTH, 'x');
    }

    if (normalized.length > ALBUM_SHORT_CODE_MAX_LENGTH) {
      return normalized.slice(0, ALBUM_SHORT_CODE_MAX_LENGTH);
    }

    return normalized;
  }
}
