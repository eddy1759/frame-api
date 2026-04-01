import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';

import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { OAuthAccount } from '../entities/oauth-account.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RedisService } from '../../common/redis/redis.service';
import { OAuthProviderFactory } from '../providers/oauth-provider.factory';
import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { OAuthProvider } from '../enums/oauth-provider.enum';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let oauthAccountRepository: jest.Mocked<Repository<OAuthAccount>>;
  let refreshTokenRepository: jest.Mocked<Repository<RefreshToken>>;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;
  let oauthProviderFactory: jest.Mocked<OAuthProviderFactory>;

  let mockOAuthProvider: {
    validateToken: jest.Mock;
    getProviderName: jest.Mock;
  };

  const mockUser: User = {
    id: 'user-uuid-1',
    email: 'test@gmail.com',
    displayName: 'Test User',
    avatarUrl: null,
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    subscriptionActive: false,
    storageUsed: 0,
    storageLimit: 5368709120,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastLoginAt: null,
    deletedAt: null,
    oauthAccounts: [],
    refreshTokens: [],
  };

  const hashToken = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

  beforeEach(async () => {
    mockOAuthProvider = {
      validateToken: jest.fn().mockResolvedValue({
        providerId: 'google-123',
        email: 'test@gmail.com',
        displayName: 'Test User',
        avatarUrl: null,
        rawProfile: { sub: 'google-123' },
      }),
      getProviderName: jest.fn().mockReturnValue(OAuthProvider.GOOGLE),
    };

    const module: TestingModule = await Test.createTestingModule({
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
              sub: 'user-uuid-1',
              email: 'test@gmail.com',
              type: 'refresh',
              jti: 'token-uuid-1',
              family: 'family-uuid-1',
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
            decode: jest.fn().mockReturnValue({
              sub: 'user-uuid-1',
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
              jti: 'token-uuid-1',
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
            findOne: jest.fn(),
            create: jest.fn(
              (dto: Partial<User>): User => ({
                ...mockUser,
                ...dto,
              }),
            ),
            save: jest.fn(
              (entity: Partial<User>): Promise<User> =>
                Promise.resolve({
                  ...mockUser,
                  ...entity,
                  id: entity.id ?? 'created-user-id',
                }),
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
            findOne: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn(
              (dto: Partial<OAuthAccount>): Partial<OAuthAccount> => dto,
            ),
            save: jest.fn(
              (entity: Partial<OAuthAccount>): Promise<Partial<OAuthAccount>> =>
                Promise.resolve({
                  ...entity,
                  id: entity.id ?? 'new-oauth-id',
                  createdAt: new Date('2026-01-01T00:00:00.000Z'),
                  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                }),
            ),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
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
            findOne: jest.fn(),
            create: jest.fn(
              (dto: Partial<RefreshToken>): Partial<RefreshToken> => dto,
            ),
            save: jest.fn(
              (entity: Partial<RefreshToken>): Promise<Partial<RefreshToken>> =>
                Promise.resolve({
                  ...entity,
                  id: entity.id ?? 'new-refresh-id',
                  createdAt: new Date('2026-01-01T00:00:00.000Z'),
                }),
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
            getProvider: jest.fn().mockReturnValue(mockOAuthProvider),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    oauthAccountRepository = module.get(getRepositoryToken(OAuthAccount));
    refreshTokenRepository = module.get(getRepositoryToken(RefreshToken));
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
    oauthProviderFactory = module.get(OAuthProviderFactory);
  });

  describe('oauthLogin', () => {
    it('creates a new user on first login', async () => {
      oauthAccountRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.oauthLogin(
        OAuthProvider.GOOGLE,
        'valid-google-token',
      );

      expect(result.isNewUser).toBe(true);
      expect(result.user.email).toBe('test@gmail.com');
      expect(userRepository.save).toHaveBeenCalled();
      expect(oauthAccountRepository.save).toHaveBeenCalled();
      expect(redisService.setAdd).toHaveBeenCalled();
    });

    it('returns existing user and updates oauth profile metadata', async () => {
      const existingOAuth: OAuthAccount = {
        id: 'oauth-uuid-1',
        userId: mockUser.id,
        provider: OAuthProvider.GOOGLE,
        providerId: 'google-123',
        providerEmail: 'old@gmail.com',
        accessToken: null,
        rawProfile: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: mockUser,
      };
      oauthAccountRepository.findOne.mockResolvedValue(existingOAuth);

      const result = await service.oauthLogin(
        OAuthProvider.GOOGLE,
        'valid-google-token',
      );

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(mockUser.id);
      expect(oauthAccountRepository.createQueryBuilder).toHaveBeenCalled();
      expect(oauthAccountRepository.query).toHaveBeenCalled();
    });

    it('links oauth account to existing user by verified email', async () => {
      oauthAccountRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.oauthLogin(
        OAuthProvider.GOOGLE,
        'valid-google-token',
      );

      expect(result.isNewUser).toBe(false);
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(oauthAccountRepository.save).toHaveBeenCalled();
    });

    it('does not link Apple private relay email by email lookup', async () => {
      oauthAccountRepository.findOne.mockResolvedValue(null);
      mockOAuthProvider.validateToken.mockResolvedValue({
        providerId: 'apple-123',
        email: 'relay@privaterelay.appleid.com',
        displayName: 'Relay User',
        avatarUrl: null,
        rawProfile: { sub: 'apple-123' },
      });
      oauthProviderFactory.getProvider.mockReturnValue(
        mockOAuthProvider as never,
      );

      const result = await service.oauthLogin(OAuthProvider.APPLE, 'token');

      expect(result.isNewUser).toBe(true);
      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('throws ForbiddenException for suspended users', async () => {
      const suspendedUser: User = {
        ...mockUser,
        status: UserStatus.SUSPENDED,
      };
      const suspendedOAuth: OAuthAccount = {
        id: 'oauth-uuid-2',
        userId: mockUser.id,
        provider: OAuthProvider.GOOGLE,
        providerId: 'google-123',
        providerEmail: mockUser.email,
        accessToken: null,
        rawProfile: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: suspendedUser,
      };
      oauthAccountRepository.findOne.mockResolvedValue(suspendedOAuth);

      await expect(
        service.oauthLogin(OAuthProvider.GOOGLE, 'valid-token'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException for deleted users', async () => {
      const deletedUser: User = {
        ...mockUser,
        status: UserStatus.DELETED,
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const deletedOAuth: OAuthAccount = {
        id: 'oauth-uuid-3',
        userId: mockUser.id,
        provider: OAuthProvider.GOOGLE,
        providerId: 'google-123',
        providerEmail: mockUser.email,
        accessToken: null,
        rawProfile: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: deletedUser,
      };
      oauthAccountRepository.findOne.mockResolvedValue(deletedOAuth);

      await expect(
        service.oauthLogin(OAuthProvider.GOOGLE, 'valid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('refreshes token pair for valid refresh token', async () => {
      const refreshValue = 'refresh-user-uuid-1';
      const storedToken: RefreshToken = {
        id: 'rt-uuid-1',
        userId: mockUser.id,
        tokenHash: hashToken(refreshValue),
        familyId: 'family-uuid-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deviceInfo: null,
        ipAddress: null,
        user: mockUser,
      };

      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        type: 'refresh',
        jti: 'token-uuid-1',
        family: 'family-uuid-1',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      refreshTokenRepository.findOne.mockResolvedValue(storedToken);

      const result = await service.refreshTokens(refreshValue);

      expect(result.accessToken).toBe(`access-${mockUser.id}`);
      expect(result.refreshToken).toBe(`refresh-${mockUser.id}`);
      expect(refreshTokenRepository.update).toHaveBeenCalledWith('rt-uuid-1', {
        isRevoked: true,
      });
    });

    it('throws for non-refresh token type', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(service.refreshTokens('not-refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when refresh token is not found in database', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.refreshTokens('missing-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('revokes entire family and user sessions on token reuse', async () => {
      const refreshValue = 'reused-token';
      const revokedToken: RefreshToken = {
        id: 'rt-uuid-2',
        userId: mockUser.id,
        tokenHash: hashToken(refreshValue),
        familyId: 'family-uuid-2',
        isRevoked: true,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deviceInfo: null,
        ipAddress: null,
        user: mockUser,
      };
      refreshTokenRepository.findOne.mockResolvedValue(revokedToken);
      redisService.setMembers.mockResolvedValue(['s1', 's2']);

      await expect(service.refreshTokens(refreshValue)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { familyId: 'family-uuid-2' },
        { isRevoked: true },
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `session:${mockUser.id}:s1`,
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `session:${mockUser.id}:s2`,
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `user:sessions:${mockUser.id}`,
      );
    });

    it('throws for expired stored refresh token record', async () => {
      const refreshValue = 'expired-refresh-token';
      const expiredToken: RefreshToken = {
        id: 'rt-uuid-3',
        userId: mockUser.id,
        tokenHash: hashToken(refreshValue),
        familyId: 'family-uuid-3',
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deviceInfo: null,
        ipAddress: null,
        user: mockUser,
      };
      refreshTokenRepository.findOne.mockResolvedValue(expiredToken);

      await expect(service.refreshTokens(refreshValue)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('sessions and profile', () => {
    it('marks current active session and cleans stale session ids', async () => {
      redisService.setMembers.mockResolvedValue(['token-a', 'token-b']);
      redisService.get.mockImplementation(
        (key: string): Promise<string | null> => {
          if (key.endsWith('token-a')) {
            return Promise.resolve(
              JSON.stringify({
                userId: mockUser.id,
                tokenId: 'token-a',
                familyId: 'fam-a',
                deviceInfo: { platform: 'ios' },
                ip: '127.0.0.1',
                createdAt: '2026-01-01T00:00:00.000Z',
              }),
            );
          }
          return Promise.resolve(null);
        },
      );

      const sessions = await service.getActiveSessions(mockUser.id, 'token-a');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'token-a',
        current: true,
      });
      expect(redisService.setRemove).toHaveBeenCalledWith(
        `user:sessions:${mockUser.id}`,
        'token-b',
      );
    });

    it('throws when trying to update profile with empty dto', async () => {
      await expect(service.updateProfile(mockUser.id, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when revokeSession target does not exist', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(
        service.revokeSession(mockUser.id, 'missing'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns null when decodeToken fails', () => {
      jwtService.decode.mockImplementation(() => {
        throw new Error('decode failed');
      });

      expect(service.decodeToken('not-a-token')).toBeNull();
    });
  });

  describe('logout and account deletion', () => {
    it('blacklists access token and revokes provided refresh token on logout', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      jwtService.decode.mockReturnValue({
        iat: nowSec - 10,
        exp: nowSec + 3600,
        jti: 'token-uuid-1',
      });

      await service.logout(mockUser, 'access-token', 'refresh-token');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { tokenHash: hashToken('refresh-token'), userId: mockUser.id },
        { isRevoked: true },
      );
      expect(redisService.set).toHaveBeenCalledWith(
        `blacklist:${mockUser.id}:${String(nowSec - 10)}`,
        '1',
        expect.any(Number),
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `session:${mockUser.id}:token-uuid-1`,
      );
    });

    it('soft deletes account and revokes all session state', async () => {
      jwtService.decode.mockReturnValue({
        iat: 1000,
        exp: 2000,
      });
      redisService.setMembers.mockResolvedValue(['s1']);

      await service.deleteAccount(mockUser, 'access-token');

      expect(userRepository.update).toHaveBeenCalledWith(mockUser.id, {
        status: UserStatus.DELETED,
      });
      expect(userRepository.softDelete).toHaveBeenCalledWith(mockUser.id);
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, isRevoked: false },
        { isRevoked: true },
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `session:${mockUser.id}:s1`,
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `user:sessions:${mockUser.id}`,
      );
    });
  });
});
