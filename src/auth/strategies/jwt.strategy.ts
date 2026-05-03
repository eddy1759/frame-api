import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RedisService } from '../../common/redis/redis.service';
import { AUTH } from '../constants/auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
  ) {
    // FIX #9: Ensure secretOrKey is always a string, never undefined
    const publicKey: string = configService.get<string>('jwt.publicKey') ?? '';

    if (!publicKey) {
      throw new Error(
        'JWT public key is not configured. Check jwt.publicKey in config.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'] as const,
      issuer: 'frame-app',
    });
  }

  /**
   * Called by Passport after JWT signature and expiry are verified.
   */
  async validate(payload: JwtPayload): Promise<User> {
    // 1. Verify token type
    if (payload.type !== 'access') {
      this.logger.warn(
        `Non-access token used for authentication: type=${payload.type}, user=${payload.sub}`,
      );
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token type. Access token required.',
      });
    }

    // 2. Check if token is blacklisted
    const iat: string = payload.iat ? String(payload.iat) : '0';
    const blacklistKey = `${AUTH.BLACKLIST_PREFIX}${payload.sub}:${iat}`;
    const isBlacklisted: boolean = await this.redisService.exists(blacklistKey);

    if (isBlacklisted) {
      this.logger.warn(
        `Blacklisted token used: user=${payload.sub}, iat=${iat}`,
      );
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_REVOKED',
        message: 'This token has been revoked. Please login again.',
      });
    }

    // 3. Find user and verify status
    const user: User | null = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'User associated with this token no longer exists.',
      });
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended.',
      });
    }

    if (user.status === UserStatus.DELETED || user.deletedAt) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'User associated with this token no longer exists.',
      });
    }

    return user;
  }
}
