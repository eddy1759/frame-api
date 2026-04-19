import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { BusinessException } from '../../common/filters/business.exception';

@Injectable()
export class ShortCodeService {
  private readonly alphabet =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  private readonly length = 8;

  generate(): string {
    return Array.from(
      { length: this.length },
      () => this.alphabet[randomInt(0, this.alphabet.length)],
    ).join('');
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
}
