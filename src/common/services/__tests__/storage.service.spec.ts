import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from '../storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  const storageConfig = {
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    bucket: 'frame-assets',
    forcePathStyle: true,
    useSsl: false,
    cdnBaseUrl: 'http://localhost:9000/frame-assets',
    connectionTimeoutMs: 100,
    socketTimeoutMs: 100,
    uploadMaxAttempts: 3,
    uploadBaseDelayMs: 0,
  };

  const createService = (): {
    service: StorageService;
    send: jest.Mock;
  } => {
    const configService = {
      get: jest.fn().mockReturnValue(storageConfig),
    } as unknown as ConfigService;

    const service = new StorageService(configService);
    const send = jest.fn();
    (service as unknown as { client: { send: jest.Mock } }).client = {
      send,
    };

    return { service, send };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates bucket on module init when bucket is missing', async () => {
    const { service, send } = createService();
    send.mockRejectedValueOnce(new Error('missing bucket'));
    send.mockResolvedValueOnce({});

    await service.onModuleInit();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uploads buffers and returns storage metadata', async () => {
    const { service, send } = createService();
    send.mockResolvedValueOnce({});

    const result = await service.uploadBuffer(
      '/frames/frame-1/original.svg',
      Buffer.from('svg'),
      'image/svg+xml',
    );

    expect(result).toEqual({
      key: 'frames/frame-1/original.svg',
      url: 'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
      size: 3,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries transient upload failures before succeeding', async () => {
    const { service, send } = createService();
    send
      .mockRejectedValueOnce(
        Object.assign(new Error('read ECONNRESET'), {
          name: 'TimeoutError',
          code: 'ECONNRESET',
        }),
      )
      .mockResolvedValueOnce({});

    await expect(
      service.uploadBuffer(
        'frames/frame-1/original.svg',
        Buffer.from('x'),
        'image/svg+xml',
      ),
    ).resolves.toEqual({
      key: 'frames/frame-1/original.svg',
      url: 'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
      size: 1,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('throws internal server error when upload keeps failing', async () => {
    const { service, send } = createService();
    send.mockRejectedValue(
      Object.assign(new Error('upload failed'), {
        code: 'ECONNRESET',
      }),
    );

    await expect(
      service.uploadBuffer(
        'frames/frame-1/original.svg',
        Buffer.from('x'),
        'image/svg+xml',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('swallows delete errors', async () => {
    const { service, send } = createService();
    send.mockRejectedValueOnce(new Error('delete failed'));

    await expect(
      service.deleteObject('frames/frame-1/original.svg'),
    ).resolves.toBeUndefined();
  });

  it('builds CDN URLs from storage keys', () => {
    const { service } = createService();
    expect(service.getPublicUrl('/frames/frame-1/original.svg')).toBe(
      'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
    );
  });

  it('generates presigned put urls', async () => {
    const { service } = createService();
    (getSignedUrl as jest.Mock).mockResolvedValueOnce(
      'https://signed.example/upload',
    );

    const result = await service.generatePresignedPutUrl(
      '/frames/frame-1/original.svg',
      'image/svg+xml',
      120,
      120,
    );

    expect(result.url).toBe('https://signed.example/upload');
    expect(result.key).toBe('frames/frame-1/original.svg');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });
});
