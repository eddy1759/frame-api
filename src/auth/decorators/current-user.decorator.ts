import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { Request } from 'express';

/**
 * Extract the current authenticated user from the request.
 *
 * @example
 * // Get full user object
 * @Get('me')
 * getProfile(@CurrentUser() user: User) { ... }
 *
 * // Get specific field
 * @Get('my-id')
 * getMyId(@CurrentUser('id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof User | undefined,
    ctx: ExecutionContext,
  ): User | User[keyof User] | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
