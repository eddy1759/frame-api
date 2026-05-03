import { ExecutionContext } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRole } from '../../../auth/enums/user-role.enum';
import { AiFrameJob } from '../../entities';
import { AiFrameOwnerGuard } from '../ai-frame-owner.guard';

describe('AiFrameOwnerGuard', () => {
  let guard: AiFrameOwnerGuard;
  let repository: jest.Mocked<Repository<AiFrameJob>>;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<AiFrameJob>>;

    guard = new AiFrameOwnerGuard(repository);
  });

  const makeContext = (user: {
    id: string;
    role: UserRole;
  }): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user,
          params: { jobId: 'job-1' },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows the job owner', async () => {
    repository.findOne.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
    } as AiFrameJob);

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: UserRole.USER })),
    ).resolves.toBe(true);
  });

  it('allows admins to access any AI frame job', async () => {
    repository.findOne.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
    } as AiFrameJob);

    await expect(
      guard.canActivate(makeContext({ id: 'admin-1', role: UserRole.ADMIN })),
    ).resolves.toBe(true);
  });

  it('rejects users who do not own the job', async () => {
    repository.findOne.mockResolvedValue({
      id: 'job-1',
      userId: 'owner-1',
    } as AiFrameJob);

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: UserRole.USER })),
    ).rejects.toThrow();
  });
});
