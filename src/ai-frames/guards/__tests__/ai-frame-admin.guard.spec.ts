import { ExecutionContext } from '@nestjs/common';
import { AiFrameAdminGuard } from '../ai-frame-admin.guard';
import { UserRole } from '../../../auth/enums/user-role.enum';

describe('AiFrameAdminGuard', () => {
  const guard = new AiFrameAdminGuard();

  const makeContext = (user?: {
    id: string;
    role: UserRole;
  }): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('allows admin users', () => {
    expect(
      guard.canActivate(makeContext({ id: 'admin-1', role: UserRole.ADMIN })),
    ).toBe(true);
  });

  it('rejects non-admin users', () => {
    expect(() =>
      guard.canActivate(makeContext({ id: 'user-1', role: UserRole.USER })),
    ).toThrow();
  });
});
