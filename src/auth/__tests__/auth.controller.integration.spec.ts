import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UnauthorizedException } from '@nestjs/common';

import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { OAuthAccount } from '../entities/oauth-account.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RedisService } from '../../common/redis/redis.service';
import { OAuthProviderFactory } from '../providers/oauth-provider.factory';
import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { OAuthProvider } from '../enums/oauth-provider.enum';
import { AuthThrottleGuard } from '../guards/custom-throttle.guard';
import { BruteForceGuard } from '../guards/brute-force.guard';

describe('AuthController (integration)', () => {
  let controller: AuthController;
  let authService: AuthService;
  let throttleGuard: jest.Mocked<AuthThrottleGuard>;
  let bruteForceGuard: jest.Mocked<BruteForceGuard>;

  const mockUser: User = {
    id: 'user-uuid-1',
    email: 'test@gmail.com',
    displayName: 'Test User',
    avatarUrl: null,
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    storageUsed: 0,
    storageLimit: 5368709120,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastLoginAt: null,
    deletedAt: null,
    oauthAccounts: [],
    refreshTokens: [],
  };

  const makeRequest = (
    ip = '127.0.0.1',
    authorization = 'Bearer access-token',
  ): Request =>
    ({
      ip,
      headers: { authorization },
    }) as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(
              (payload: { type: 'access' | 'refresh'; sub: string }) =>
                payload.type === 'access'
                  ? `access-${payload.sub}`
                  : `refresh-${payload.sub}`,
            ),
            verify: jest.fn().mockReturnValue({
              sub: mockUser.id,
              email: mockUser.email,
              type: 'refresh',
              jti: 'token-uuid-1',
              family: 'family-uuid-1',
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
            decode: jest.fn().mockReturnValue({
              sub: mockUser.id,
              jti: 'token-uuid-1',
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string): number | undefined => {
              const config: Record<string, number> = {
                'jwt.accessTokenTtl': 3600,
                'jwt.refreshTokenTtl': 2592000,
              };
              return config[key];
            }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockUser),
            create: jest.fn(
              (dto: Partial<User>): User => ({
                ...mockUser,
                ...dto,
              }),
            ),
            save: jest.fn(
              (entity: Partial<User>): Promise<User> =>
                Promise.resolve({ ...mockUser, ...entity }),
            ),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            }),
          },
        },
        {
          provide: getRepositoryToken(OAuthAccount),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn(
              (dto: Partial<OAuthAccount>): Partial<OAuthAccount> => dto,
            ),
            save: jest.fn(
              (entity: Partial<OAuthAccount>): Promise<Partial<OAuthAccount>> =>
                Promise.resolve({ ...entity, id: 'oauth-id-1' }),
            ),
            query: jest.fn().mockResolvedValue(undefined),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            }),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn(
              (dto: Partial<RefreshToken>): Partial<RefreshToken> => dto,
            ),
            save: jest.fn(
              (entity: Partial<RefreshToken>): Promise<Partial<RefreshToken>> =>
                Promise.resolve(entity),
            ),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
            setAdd: jest.fn().mockResolvedValue(undefined),
            setMembers: jest.fn().mockResolvedValue([]),
            setRemove: jest.fn().mockResolvedValue(undefined),
            expire: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: OAuthProviderFactory,
          useValue: {
            getProvider: jest.fn().mockReturnValue({
              validateToken: jest.fn().mockResolvedValue({
                providerId: 'google-123',
                email: mockUser.email,
                displayName: mockUser.displayName,
                avatarUrl: mockUser.avatarUrl,
                rawProfile: { sub: 'google-123' },
              }),
              getProviderName: jest.fn().mockReturnValue(OAuthProvider.GOOGLE),
            }),
          },
        },
        {
          provide: AuthThrottleGuard,
          useValue: {
            checkRateLimit: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: BruteForceGuard,
          useValue: {
            checkBruteForce: jest.fn().mockResolvedValue(undefined),
            recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
            resetAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    throttleGuard = module.get(AuthThrottleGuard);
    bruteForceGuard = module.get(BruteForceGuard);
  });

  it('runs google login happy path and resets brute-force counter', async () => {
    const result = await controller.googleLogin(
      { token: 'provider-token' },
      makeRequest('10.0.0.1'),
    );

    expect(throttleGuard.checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '10.0.0.1' }),
      { limit: 10, ttlSeconds: 60 },
    );
    expect(bruteForceGuard.checkBruteForce).toHaveBeenCalledWith('10.0.0.1');
    expect(bruteForceGuard.resetAttempts).toHaveBeenCalledWith('10.0.0.1');
    expect(result).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ id: mockUser.id }),
    });
  });

  it('records failed brute-force attempt when google login is unauthorized', async () => {
    jest.spyOn(authService, 'oauthLogin').mockRejectedValue(
      new UnauthorizedException({
        code: 'AUTH_PROVIDER_TOKEN_INVALID',
        message: 'Invalid provider token',
      }),
    );

    await expect(
      controller.googleLogin(
        { token: 'invalid-token' },
        makeRequest('8.8.8.8'),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(bruteForceGuard.recordFailedAttempt).toHaveBeenCalledWith('8.8.8.8');
    expect(bruteForceGuard.resetAttempts).not.toHaveBeenCalled();
  });

  it('passes Apple fullName payload through to auth service', async () => {
    const oauthLoginSpy = jest.spyOn(authService, 'oauthLogin');

    await controller.appleLogin(
      {
        token: 'apple-token',
        fullName: { firstName: 'John', lastName: 'Doe' },
        deviceInfo: { platform: 'ios' },
      },
      makeRequest('192.168.1.2'),
    );

    expect(oauthLoginSpy).toHaveBeenCalledWith(
      OAuthProvider.APPLE,
      'apple-token',
      { fullName: { firstName: 'John', lastName: 'Doe' } },
      { platform: 'ios' },
      '192.168.1.2',
    );
  });

  it('forwards refresh token and caller ip to refresh flow', async () => {
    const refreshSpy = jest
      .spyOn(authService, 'refreshTokens')
      .mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      });

    await controller.refreshTokens(
      { refreshToken: 'refresh-token' },
      makeRequest('203.0.113.5'),
    );

    expect(throttleGuard.checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '203.0.113.5' }),
      { limit: 20, ttlSeconds: 60 },
    );
    expect(refreshSpy).toHaveBeenCalledWith(
      'refresh-token',
      undefined,
      '203.0.113.5',
    );
  });

  it('uses decoded jti as current session id in sessions response', async () => {
    const decodeSpy = jest.spyOn(authService, 'decodeToken').mockReturnValue({
      sub: mockUser.id,
      email: mockUser.email,
      type: 'access',
      jti: 'current-session-id',
    });
    const getSessionsSpy = jest
      .spyOn(authService, 'getActiveSessions')
      .mockResolvedValue([
        {
          id: 'current-session-id',
          deviceInfo: { platform: 'ios' },
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          current: true,
        },
      ]);

    const result = await controller.getSessions(
      mockUser,
      makeRequest('127.0.0.1', 'Bearer current-access-token'),
    );

    expect(decodeSpy).toHaveBeenCalledWith('current-access-token');
    expect(getSessionsSpy).toHaveBeenCalledWith(
      mockUser.id,
      'current-session-id',
    );
    expect(result.sessions[0].current).toBe(true);
  });

  it('extracts and forwards bearer token for logout', async () => {
    const logoutSpy = jest
      .spyOn(authService, 'logout')
      .mockResolvedValue(undefined);

    const result = await controller.logout(
      mockUser,
      makeRequest('127.0.0.1', 'Bearer abc.xyz.123'),
      { refreshToken: 'refresh-token-1' },
    );

    expect(logoutSpy).toHaveBeenCalledWith(
      mockUser,
      'abc.xyz.123',
      'refresh-token-1',
    );
    expect(result).toEqual({ message: 'Logged out successfully.' });
  });
});
