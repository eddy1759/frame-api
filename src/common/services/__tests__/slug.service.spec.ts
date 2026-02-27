import { SlugService } from '../slug.service';

describe('SlugService', () => {
  let service: SlugService;

  beforeEach(() => {
    service = new SlugService();
  });

  it('normalizes strings into slugs', () => {
    expect(service.toSlug('  Hello, Frame World!  ')).toBe('hello-frame-world');
  });

  it('returns empty slug when all characters are stripped', () => {
    expect(service.toSlug('$$$')).toBe('');
  });

  it('returns the base slug when unique', async () => {
    const slug = await service.generateUniqueSlug('Nature Frame', () =>
      Promise.resolve(false),
    );
    expect(slug).toBe('nature-frame');
  });

  it('appends incremental suffix when slug already exists', async () => {
    const exists = jest
      .fn<Promise<boolean>, [string]>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const slug = await service.generateUniqueSlug('Nature Frame', exists);

    expect(slug).toBe('nature-frame-3');
    expect(exists).toHaveBeenNthCalledWith(1, 'nature-frame');
    expect(exists).toHaveBeenNthCalledWith(2, 'nature-frame-2');
    expect(exists).toHaveBeenNthCalledWith(3, 'nature-frame-3');
  });

  it('falls back to item when base slug is empty', async () => {
    const slug = await service.generateUniqueSlug('@@@', () =>
      Promise.resolve(false),
    );
    expect(slug).toBe('item');
  });
});
