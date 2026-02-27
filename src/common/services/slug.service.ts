import { Injectable } from '@nestjs/common';

@Injectable()
export class SlugService {
  toSlug(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async generateUniqueSlug(
    input: string,
    exists: (slug: string) => Promise<boolean>,
  ): Promise<string> {
    const baseSlug = this.toSlug(input);
    if (!baseSlug) {
      return 'item';
    }

    let candidate = baseSlug;
    let suffix = 2;

    while (await exists(candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}
