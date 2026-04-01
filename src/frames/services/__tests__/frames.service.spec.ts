import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRole } from '../../../auth/enums/user-role.enum';
import { Frame } from '../../entities/frame.entity';
import { FramesService } from '../frames.service';

describe('FramesService', () => {
  let service: FramesService;
  let frameRepository: jest.Mocked<Repository<Frame>>;

  beforeEach(() => {
    frameRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Frame>>;

    service = new FramesService(
      frameRepository,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('throws when the frame does not exist for image attachment', async () => {
    frameRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertFrameEligibleForImage('missing-frame', {
        role: UserRole.USER,
        subscriptionActive: false,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects premium frames for unsubscribed non-admin users', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: true,
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        role: UserRole.USER,
        subscriptionActive: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows premium frames for subscribed users', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: true,
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        role: UserRole.USER,
        subscriptionActive: true,
      }),
    ).resolves.toEqual({
      id: 'frame-1',
      isPremium: true,
    });
  });

  it('allows premium frames for admins without a subscription flag', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: true,
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        role: UserRole.ADMIN,
        subscriptionActive: false,
      }),
    ).resolves.toEqual({
      id: 'frame-1',
      isPremium: true,
    });
  });
});
