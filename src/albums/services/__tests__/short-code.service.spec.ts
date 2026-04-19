import { ShortCodeService } from '../short-code.service';

describe('ShortCodeService', () => {
  let service: ShortCodeService;

  beforeEach(() => {
    service = new ShortCodeService();
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
});
