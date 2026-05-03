import { SlugService } from '../../../common/services';
import { ShortCodeService } from '../short-code.service';

describe('ShortCodeService', () => {
  let service: ShortCodeService;

  beforeEach(() => {
    service = new ShortCodeService(new SlugService());
  });

  it('generates an 8-character human-safe base58 code', () => {
    const code = service.generate();

    expect(code).toMatch(/^[1-9A-HJ-NP-Za-km-z]{8}$/);
  });

  it('retries until it finds a unique code', async () => {
    const generateSpy = jest
      .spyOn(service, 'generate')
      .mockReturnValueOnce('3mH8cQpL')
      .mockReturnValueOnce('4nJ9dRtM');

    const exists = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(service.generateUnique(exists)).resolves.toBe('4nJ9dRtM');
    expect(generateSpy).toHaveBeenCalledTimes(2);
  });

  it('normalizes custom short codes into lowercase slugs', () => {
    expect(
      service.normalizeCustomShortCode('  Edet Wedding Anniversary  '),
    ).toBe('edet-wedding-anniversary');
  });

  it('builds a unique short code from the album name', async () => {
    const exists = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      service.generateUniqueFromName('Edet Wedding Anniversary', exists),
    ).resolves.toBe('edet-wedding-anniversary-2');
  });
});
