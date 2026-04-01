import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Image } from '../entities/image.entity';
import { BusinessException } from '../../common/filters/business.exception';

interface ImageOwnerRequest extends Request {
  user?: Pick<User, 'id'>;
  params: {
    id?: string;
  };
}

@Injectable()
export class ImageOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ImageOwnerRequest>();
    const userId = request.user?.id;
    const imageId = request.params?.id;

    if (!userId || !imageId) {
      throw new BusinessException(
        'UNAUTHORIZED',
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const image = await this.imageRepository.findOne({
      where: { id: imageId },
      select: ['id', 'userId', 'isPublic'],
    });

    if (!image) {
      throw new BusinessException(
        'IMAGE_NOT_FOUND',
        'Image not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (image.userId !== userId) {
      throw new BusinessException(
        'IMAGE_NOT_OWNED',
        'You do not have access to this image',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
