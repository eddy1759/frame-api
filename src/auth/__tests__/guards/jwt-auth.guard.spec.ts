import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new JwtAuthGuard(reflector);
  });

  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    }) as unknown as ExecutionContext;

  it('should allow access to @Public() routes', (): void => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('should throw AUTH_TOKEN_EXPIRED for expired tokens', () => {
    const expiredError = new Error('jwt expired');
    expiredError.name = 'TokenExpiredError';

    expect(() => {
      guard.handleRequest(null, false, expiredError);
    }).toThrow(UnauthorizedException);

    try {
      guard.handleRequest(null, false, expiredError);
    } catch (error) {
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'AUTH_TOKEN_EXPIRED',
      });
    }
  });

  it('should throw AUTH_INVALID_TOKEN for invalid tokens', () => {
    const invalidError = new Error('invalid signature');
    invalidError.name = 'JsonWebTokenError';

    expect(() => {
      guard.handleRequest(null, false, invalidError);
    }).toThrow(UnauthorizedException);

    try {
      guard.handleRequest(null, false, invalidError);
    } catch (error) {
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'AUTH_INVALID_TOKEN',
      });
    }
  });

  it('should throw when no user is returned', () => {
    expect(() => {
      guard.handleRequest(null, false, undefined);
    }).toThrow(UnauthorizedException);
  });

  it('should return user when valid', () => {
    const mockUser = { id: 'user-1', email: 'test@test.com' };
    const result = guard.handleRequest(null, mockUser, undefined);
    expect(result).toEqual(mockUser);
  });
});
