/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { Request } from 'express';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { AuthThrottleGuard } from '../src/auth/guards/custom-throttle.guard';
import { BruteForceGuard } from '../src/auth/guards/brute-force.guard';
import { OAuthProvider } from '../src/auth/enums/oauth-provider.enum';
import { User } from '../src/auth/entities/user.entity';
import { UserStatus } from '../src/auth/enums/user-status.enum';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const mockCurrentUser: User = {
  id: 'user-1',
  email: 'e2e@test.com',
  displayName: 'E2E User',
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

const authServiceMock = {
  adminPasswordSignIn: jest.fn(),
  oauthLogin: jest.fn(),
  refreshTokens: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  deleteAccount: jest.fn(),
  logout: jest.fn(),
  logoutAll: jest.fn(),
  decodeToken: jest.fn(),
  getActiveSessions: jest.fn(),
  revokeSession: jest.fn(),
};

const throttleGuardMock = {
  checkRateLimit: jest.fn(),
};

const bruteForceGuardMock = {
  checkBruteForce: jest.fn(),
  recordFailedAttempt: jest.fn(),
  resetAttempts: jest.fn(),
};

@Injectable()
class TestJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requestObj = context.switchToHttp().getRequest<
      Request & {
        headers: Record<string, string | undefined>;
        user?: User;
      }
    >();
    const authorization = requestObj.headers.authorization;

    if (authorization === 'Bearer valid-access-token') {
      requestObj.user = mockCurrentUser;
      return true;
    }

    throw new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Authentication token is missing or invalid.',
    });
  }
}

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AuthService,
      useValue: authServiceMock,
    },
    {
      provide: AuthThrottleGuard,
      useValue: throttleGuardMock,
    },
    {
      provide: BruteForceGuard,
      useValue: bruteForceGuardMock,
    },
    {
      provide: APP_GUARD,
      useClass: TestJwtGuard,
    },
  ],
})
class AuthE2eTestModule {}

describe('Auth API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthE2eTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    throttleGuardMock.checkRateLimit.mockResolvedValue(undefined);
    bruteForceGuardMock.checkBruteForce.mockResolvedValue(undefined);
    bruteForceGuardMock.recordFailedAttempt.mockResolvedValue(undefined);
    bruteForceGuardMock.resetAttempts.mockResolvedValue(undefined);

    authServiceMock.oauthLogin.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      isNewUser: false,
      user: {
        id: mockCurrentUser.id,
        email: mockCurrentUser.email,
        displayName: mockCurrentUser.displayName,
        avatarUrl: mockCurrentUser.avatarUrl,
        status: mockCurrentUser.status,
        role: mockCurrentUser.role,
        subscriptionActive: false,
        storageUsed: 0,
        storageLimit: 5368709120,
        createdAt: mockCurrentUser.createdAt,
        lastLoginAt: null,
        linkedAccounts: [],
      },
    });

    authServiceMock.adminPasswordSignIn.mockResolvedValue({
      accessToken: 'admin-access-token',
      refreshToken: 'admin-refresh-token',
      expiresIn: 3600,
      isNewUser: false,
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Admin User',
        avatarUrl: null,
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
        subscriptionActive: false,
        storageUsed: 0,
        storageLimit: 5368709120,
        createdAt: mockCurrentUser.createdAt,
        lastLoginAt: null,
        linkedAccounts: [],
      },
    });

    authServiceMock.refreshTokens.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    });

    authServiceMock.getProfile.mockResolvedValue({
      id: mockCurrentUser.id,
      email: mockCurrentUser.email,
      displayName: mockCurrentUser.displayName,
      avatarUrl: mockCurrentUser.avatarUrl,
      status: mockCurrentUser.status,
      role: mockCurrentUser.role,
      subscriptionActive: false,
      storageUsed: 0,
      storageLimit: 5368709120,
      createdAt: mockCurrentUser.createdAt,
      lastLoginAt: null,
      linkedAccounts: [],
    });

    authServiceMock.updateProfile.mockResolvedValue({
      id: mockCurrentUser.id,
      email: mockCurrentUser.email,
      displayName: 'Updated Name',
      avatarUrl: 'https://example.com/a.png',
      status: mockCurrentUser.status,
      role: mockCurrentUser.role,
      subscriptionActive: false,
      storageUsed: 0,
      storageLimit: 5368709120,
      createdAt: mockCurrentUser.createdAt,
      lastLoginAt: null,
      linkedAccounts: [],
    });

    authServiceMock.decodeToken.mockReturnValue({
      sub: mockCurrentUser.id,
      email: mockCurrentUser.email,
      type: 'access',
      jti: 'session-1',
    });

    authServiceMock.getActiveSessions.mockResolvedValue([
      {
        id: 'session-1',
        deviceInfo: { platform: 'ios' },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        current: true,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public auth routes', () => {
    it('accepts valid admin sign-in payload and returns envelope', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/admin/signin')
        .send({
          email: 'ADMIN@example.com',
          password: 'CorrectHorseBatteryStaple!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.accessToken).toBe('admin-access-token');
          expect(res.body.meta.requestId).toBeDefined();
        })
        .then(() => {
          expect(authServiceMock.adminPasswordSignIn).toHaveBeenCalledWith(
            'admin@example.com',
            'CorrectHorseBatteryStaple!',
            undefined,
            expect.any(String),
          );
        });
    });

    it('returns 400 when admin sign-in payload is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/admin/signin')
        .send({ email: 'not-an-email', password: '' })
        .expect(400)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('BAD_REQUEST');
        });
    });

    it('accepts valid Google login payload and returns envelope', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/google')
        .send({ token: 'provider-token' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.accessToken).toBe('access-token');
          expect(res.body.meta.requestId).toBeDefined();
          expect(res.headers['x-request-id']).toBe(res.body.meta.requestId);
        })
        .then(() => {
          expect(authServiceMock.oauthLogin).toHaveBeenCalledWith(
            OAuthProvider.GOOGLE,
            'provider-token',
            undefined,
            undefined,
            expect.any(String),
          );
          expect(bruteForceGuardMock.resetAttempts).toHaveBeenCalled();
        });
    });

    it('returns 400 when Google payload is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/google')
        .send({ token: '', extra: 'not-allowed' })
        .expect(400)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('BAD_REQUEST');
        });
    });

    it('records brute-force attempt when provider auth is unauthorized', () => {
      authServiceMock.oauthLogin.mockRejectedValue(
        new UnauthorizedException({
          code: 'AUTH_PROVIDER_TOKEN_INVALID',
          message: 'Invalid token',
        }),
      );

      return request(app.getHttpServer())
        .post('/api/v1/auth/google')
        .send({ token: 'bad-token' })
        .expect(401)
        .expect((res) => {
          expect(res.body.error.code).toBe('AUTH_PROVIDER_TOKEN_INVALID');
        })
        .then(() => {
          expect(bruteForceGuardMock.recordFailedAttempt).toHaveBeenCalledWith(
            expect.any(String),
          );
        });
    });

    it('returns standardized invalid admin credential errors', () => {
      authServiceMock.adminPasswordSignIn.mockRejectedValue(
        new UnauthorizedException({
          code: 'AUTH_INVALID_ADMIN_CREDENTIALS',
          message: 'Invalid email or password.',
        }),
      );

      return request(app.getHttpServer())
        .post('/api/v1/auth/admin/signin')
        .send({
          email: 'admin@example.com',
          password: 'wrong-password',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('AUTH_INVALID_ADMIN_CREDENTIALS');
        });
    });

    it('passes request id from headers through to response envelope', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/apple')
        .set('x-request-id', 'req-auth-e2e-123')
        .send({ token: 'apple-provider-token' })
        .expect(200)
        .expect((res) => {
          expect(res.body.meta.requestId).toBe('req-auth-e2e-123');
          expect(res.headers['x-request-id']).toBe('req-auth-e2e-123');
        });
    });
  });

  describe('protected auth routes', () => {
    it('returns 401 for protected route without bearer token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
        });
    });

    it('returns profile for protected route with valid bearer token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-access-token')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe(mockCurrentUser.id);
        })
        .then(() => {
          expect(authServiceMock.getProfile).toHaveBeenCalledWith(
            mockCurrentUser.id,
          );
        });
    });

    it('validates profile update payload on protected route', () => {
      return request(app.getHttpServer())
        .put('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-access-token')
        .send({ avatarUrl: 'not-a-url' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe('BAD_REQUEST');
        });
    });

    it('returns active session list and marks current session', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', 'Bearer valid-access-token')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.sessions).toHaveLength(1);
          expect(res.body.data.sessions[0].current).toBe(true);
        })
        .then(() => {
          expect(authServiceMock.decodeToken).toHaveBeenCalledWith(
            'valid-access-token',
          );
          expect(authServiceMock.getActiveSessions).toHaveBeenCalledWith(
            mockCurrentUser.id,
            'session-1',
          );
        });
    });
  });

  describe('error envelope consistency', () => {
    it('returns throttling errors in standard error envelope', () => {
      throttleGuardMock.checkRateLimit.mockRejectedValue(
        new BadRequestException({
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: 'Too many requests.',
        }),
      );

      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'rt' })
        .expect(400)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('AUTH_RATE_LIMIT_EXCEEDED');
          expect(res.body.meta.requestId).toBeDefined();
        });
    });
  });
});
