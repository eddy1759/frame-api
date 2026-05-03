import { ExecutionContext } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AiFrameIteration } from '../../entities';
import { AiFrameIterationGuard } from '../ai-frame-iteration.guard';

describe('AiFrameIterationGuard', () => {
  let guard: AiFrameIterationGuard;
  let repository: jest.Mocked<Repository<AiFrameIteration>>;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<AiFrameIteration>>;

    guard = new AiFrameIterationGuard(repository);
  });

  const makeContext = (): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          params: { jobId: 'job-1' },
          body: { iterationId: 'iteration-1' },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows requests when the iteration belongs to the job', async () => {
    repository.findOne.mockResolvedValue({
      id: 'iteration-1',
    } as AiFrameIteration);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('rejects requests when the iteration does not belong to the job', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext())).rejects.toThrow();
  });
});
