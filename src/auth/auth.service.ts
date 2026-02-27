import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';

import { User } from './entities/user.entity';
import { OAuthAccount } from './entities/oauth-account.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserStatus } from './enums/user-status.enum';
import { OAuthProvider } from './enums/oauth-provider.enum';
import {
  JwtPayload,
  TokenPair,
  AuthResponse,
  SanitizedUser,
  LinkedAccount,
  DeviceInfo,
} from './interfaces';
import { AUTH } from './constants/auth.constants';
import { RedisService } from '../common/redis/redis.service';
import { OAuthProviderFactory } from './providers/oauth-provider.factory';
import { UpdateProfileDto } from './dto/update-profile.dto';

// â”€â”€â”€ Type for session data stored in Redis â”€â”€â”€
interface SessionData {
  userId: string;
  tokenId: string;
  familyId: string;
  deviceInfo: DeviceInfo | null;
  ip: string | null;
  createdAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OAuthAccount)
    private readonly oauthAccountRepository: Repository<OAuthAccount>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly redisService: RedisService,
    private readonly oauthProviderFactory: OAuthProviderFactory,
  ) {}

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // OAuth Login
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async oauthLogin(
    provider: OAuthProvider,
    providerToken: string,
    additionalData?: {
      fullName?: { firstName?: string; lastName?: string };
    },
    deviceInfo?: DeviceInfo,
    ip?: string,
  ): Promise<AuthResponse> {
    // 1. Validate token with OAuth provider
    const oauthProvider = this.oauthProviderFactory.getProvider(provider);
    const userInfo = await oauthProvider.validateToken(
      providerToken,
      additionalData as Record<string, unknown> | undefined,
    );

    this.logger.log(
      `OAuth login attempt: provider=${provider}, providerId=${userInfo.providerId}, email=${userInfo.email ?? 'none'}`,
    );

    // 2. Find existing OAuth account
    const oauthAccount = await this.oauthAccountRepository.findOne({
      where: {
        provider,
        providerId: userInfo.providerId,
      },
      relations: ['user'],
    });

    let user: User | null = null;
    let isNewUser = false;

    if (oauthAccount) {
      // â”€â”€ Returning user â”€â”€
      user = oauthAccount.user;

      // FIX #5: Use query builder for jsonb update to avoid TypeORM deep partial type issues
      await this.oauthAccountRepository
        .createQueryBuilder()
        .update(OAuthAccount)
        .set({
          providerEmail: userInfo.email,
        })
        .where('id = :id', { id: oauthAccount.id })
        .execute();

      // Update raw profile separately if needed
      if (userInfo.rawProfile) {
        await this.oauthAccountRepository.query(
          `UPDATE "oauth_accounts" SET "raw_profile" = $1 WHERE "id" = $2`,
          [JSON.stringify(userInfo.rawProfile), oauthAccount.id],
        );
      }

      this.logger.log(
        `Returning user: userId=${user.id}, provider=${provider}`,
      );
    } else {
      // â”€â”€ New OAuth account â”€â”€

      // Check if user exists by email (for account linking)
      if (userInfo.email && !this.isApplePrivateRelay(userInfo.email)) {
        user = await this.userRepository.findOne({
          where: { email: userInfo.email },
        });

        if (user) {
          this.logger.log(
            `Linking new ${provider} account to existing user: userId=${user.id}, email=${userInfo.email}`,
          );
        }
      }

      if (!user) {
        // Create brand new user
        user = this.userRepository.create({
          email: userInfo.email,
          displayName: userInfo.displayName,
          avatarUrl: userInfo.avatarUrl,
          status: UserStatus.ACTIVE,
        });
        user = await this.userRepository.save(user);
        isNewUser = true;

        this.logger.log(
          `New user created: userId=${user.id}, email=${userInfo.email ?? 'none'}`,
        );
      }

      // Link OAuth account to user
      const newOauthAccount = this.oauthAccountRepository.create({
        userId: user.id,
        provider,
        providerId: userInfo.providerId,
        providerEmail: userInfo.email,
      });
      await this.oauthAccountRepository.save(newOauthAccount);

      // Store raw profile separately
      if (userInfo.rawProfile) {
        await this.oauthAccountRepository.query(
          `UPDATE "oauth_accounts" SET "raw_profile" = $1 WHERE "id" = $2`,
          [JSON.stringify(userInfo.rawProfile), newOauthAccount.id],
        );
      }
    }

    // 3. Check account status
    if (user.status === UserStatus.SUSPENDED) {
      this.logger.warn(`Suspended user attempted login: userId=${user.id}`);
      throw new ForbiddenException({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    if (user.status === UserStatus.DELETED || user.deletedAt) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Account not found.',
      });
    }

    // 4. Update last login timestamp
    await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
    });
    user.lastLoginAt = new Date();

    // 5. Generate token pair
    const tokens = await this.generateTokenPair(user, deviceInfo, ip);

    // 6. Build response
    const linkedAccounts = await this.getLinkedAccounts(user.id);

    return {
      ...tokens,
      user: this.sanitizeUser(user, linkedAccounts),
      isNewUser,
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Token Generation
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async generateTokenPair(
    user: User,
    deviceInfo?: DeviceInfo,
    ip?: string,
  ): Promise<TokenPair> {
    const tokenId = randomUUID();
    const familyId = randomUUID();

    return this.generateTokenPairWithFamily(
      user,
      familyId,
      tokenId,
      deviceInfo,
      ip,
    );
  }

  private async generateTokenPairWithFamily(
    user: User,
    familyId: string,
    tokenId: string,
    deviceInfo?: DeviceInfo,
    ip?: string,
  ): Promise<TokenPair> {
    // FIX #4: Explicitly type these as number, use string key with proper fallback
    const accessTokenTtl: number =
      this.configService.get<number>('jwt.accessTokenTtl') ??
      AUTH.ACCESS_TOKEN_TTL;
    const refreshTokenTtl: number =
      this.configService.get<number>('jwt.refreshTokenTtl') ??
      AUTH.REFRESH_TOKEN_TTL;

    // Generate access token
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
      role: user.role,
      subscriptionActive: false,
    };

    const accessToken: string = this.jwtService.sign(accessPayload, {
      expiresIn: accessTokenTtl,
    });

    // Generate refresh token
    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
      role: user.role,
      subscriptionActive: false,
      jti: tokenId,
      family: familyId,
    };

    const refreshToken: string = this.jwtService.sign(refreshPayload, {
      expiresIn: refreshTokenTtl,
    });

    // Hash refresh token for database storage
    const tokenHash: string = this.hashToken(refreshToken);

    // Store refresh token record in database
    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash,
      familyId,
      deviceInfo: deviceInfo ?? null,
      ipAddress: ip ?? null,
      expiresAt: new Date(Date.now() + refreshTokenTtl * 1000),
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    // Store session in Redis
    const sessionKey = `${AUTH.SESSION_PREFIX}${user.id}:${tokenId}`;
    const sessionData: SessionData = {
      userId: user.id,
      tokenId,
      familyId,
      deviceInfo: deviceInfo ?? null,
      ip: ip ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.redisService.set(
      sessionKey,
      JSON.stringify(sessionData),
      accessTokenTtl,
    );

    // Track session in user's session set
    const userSessionsKey = `${AUTH.USER_SESSIONS_PREFIX}${user.id}`;
    await this.redisService.setAdd(userSessionsKey, tokenId);
    await this.redisService.expire(userSessionsKey, refreshTokenTtl);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenTtl,
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Token Refresh
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async refreshTokens(
    refreshTokenValue: string,
    deviceInfo?: DeviceInfo,
    ip?: string,
  ): Promise<TokenPair> {
    // 1. Verify refresh token JWT
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshTokenValue);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: 'AUTH_REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired. Please login again.',
        });
      }
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid refresh token.',
      });
    }

    // 2. Verify token type
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token type. Refresh token required.',
      });
    }

    // 3. Find token record by hash
    const tokenHash: string = this.hashToken(refreshTokenValue);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!storedToken) {
      this.logger.warn(
        `Refresh token not found in database: user=${payload.sub}`,
      );
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Refresh token not recognized.',
      });
    }

    // 4. CRITICAL: Check for token reuse (security breach detection)
    if (storedToken.isRevoked) {
      this.logger.error(
        `ðŸš¨ REFRESH TOKEN REUSE DETECTED: userId=${storedToken.userId}, familyId=${storedToken.familyId}`,
      );

      // Revoke ALL tokens in the family
      await this.revokeTokenFamily(storedToken.familyId);

      // Clear ALL sessions for this user
      await this.revokeAllUserSessions(storedToken.userId);

      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_TOKEN_REUSE',
        message:
          'Security alert: Token reuse detected. All sessions have been revoked. Please login again.',
      });
    }

    // 5. Check token expiry (belt-and-suspenders â€” JWT verify already checks)
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired. Please login again.',
      });
    }

    // 6. Check user status
    const user: User | null = storedToken.user ?? null;
    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.DELETED
    ) {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        message: 'Account is no longer active.',
      });
    }

    // 7. Revoke the current refresh token (it's been used)
    await this.refreshTokenRepository.update(storedToken.id, {
      isRevoked: true,
    });

    // 8. Generate new token pair with SAME family ID
    const newTokenId: string = randomUUID();
    const tokens = await this.generateTokenPairWithFamily(
      user,
      storedToken.familyId,
      newTokenId,
      deviceInfo ?? storedToken.deviceInfo ?? undefined,
      ip ?? storedToken.ipAddress ?? undefined,
    );

    this.logger.log(
      `Token refreshed: userId=${user.id}, familyId=${storedToken.familyId}`,
    );

    return tokens;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Logout
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async logout(
    user: User,
    accessToken: string,
    refreshTokenValue?: string,
  ): Promise<void> {
    // 1. Blacklist the access token
    await this.blacklistAccessToken(accessToken, user.id);

    // 2. Revoke refresh token if provided
    if (refreshTokenValue) {
      const tokenHash: string = this.hashToken(refreshTokenValue);
      await this.refreshTokenRepository.update(
        { tokenHash, userId: user.id },
        { isRevoked: true },
      );
    }

    // 3. Remove session from Redis
    const decoded = this.decodeToken(accessToken);
    if (decoded?.jti) {
      const sessionKey = `${AUTH.SESSION_PREFIX}${user.id}:${decoded.jti}`;
      await this.redisService.del(sessionKey);

      const userSessionsKey = `${AUTH.USER_SESSIONS_PREFIX}${user.id}`;
      await this.redisService.setRemove(userSessionsKey, decoded.jti);
    }

    this.logger.log(`User logged out: userId=${user.id}`);
  }

  async logoutAll(user: User, currentAccessToken: string): Promise<void> {
    // 1. Revoke ALL refresh tokens for this user
    await this.refreshTokenRepository.update(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );

    // 2. Blacklist current access token
    await this.blacklistAccessToken(currentAccessToken, user.id);

    // 3. Clear ALL sessions from Redis
    await this.revokeAllUserSessions(user.id);

    this.logger.log(`All sessions revoked: userId=${user.id}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Session Management
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async getActiveSessions(
    userId: string,
    currentTokenId?: string,
  ): Promise<
    Array<{
      id: string;
      deviceInfo: DeviceInfo | null;
      ipAddress: string | null;
      createdAt: string;
      current: boolean;
    }>
  > {
    const userSessionsKey = `${AUTH.USER_SESSIONS_PREFIX}${userId}`;
    const tokenIds: string[] =
      await this.redisService.setMembers(userSessionsKey);

    const sessions: Array<{
      id: string;
      deviceInfo: DeviceInfo | null;
      ipAddress: string | null;
      createdAt: string;
      current: boolean;
    }> = [];

    for (const tokenId of tokenIds) {
      const sessionKey = `${AUTH.SESSION_PREFIX}${userId}:${tokenId}`;
      const sessionDataStr: string | null =
        await this.redisService.get(sessionKey);

      if (sessionDataStr) {
        const parsed = JSON.parse(sessionDataStr) as SessionData;
        sessions.push({
          id: tokenId,
          deviceInfo: parsed.deviceInfo,
          ipAddress: parsed.ip,
          createdAt: parsed.createdAt,
          current: tokenId === currentTokenId,
        });
      } else {
        // Session expired in Redis â€” clean up the set
        await this.redisService.setRemove(userSessionsKey, tokenId);
      }
    }

    return sessions;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    // Remove session from Redis
    const sessionKey = `${AUTH.SESSION_PREFIX}${userId}:${sessionId}`;
    const sessionDataStr: string | null =
      await this.redisService.get(sessionKey);

    if (!sessionDataStr) {
      throw new BadRequestException({
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found or already expired.',
      });
    }

    const parsed = JSON.parse(sessionDataStr) as SessionData;

    // Revoke the refresh token family associated with this session
    if (parsed.familyId) {
      await this.revokeTokenFamily(parsed.familyId);
    }

    // Remove session
    await this.redisService.del(sessionKey);
    const userSessionsKey = `${AUTH.USER_SESSIONS_PREFIX}${userId}`;
    await this.redisService.setRemove(userSessionsKey, sessionId);

    this.logger.log(
      `Session revoked: userId=${userId}, sessionId=${sessionId}`,
    );
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // User Profile
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async getProfile(userId: string): Promise<SanitizedUser> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'User not found.',
      });
    }

    const linkedAccounts = await this.getLinkedAccounts(userId);
    return this.sanitizeUser(user, linkedAccounts);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<SanitizedUser> {
    // FIX #2: Build a plain object for update â€” not Partial<User> which includes relationships
    const updateData: Record<string, string> = {};

    if (dto.displayName !== undefined) {
      updateData['displayName'] = dto.displayName;
    }
    if (dto.avatarUrl !== undefined) {
      updateData['avatarUrl'] = dto.avatarUrl;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'No fields to update.',
      });
    }

    // Use query builder to avoid deep partial type issues
    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set(updateData)
      .where('id = :id', { id: userId })
      .execute();

    this.logger.log(
      `Profile updated: userId=${userId}, fields=${Object.keys(updateData).join(', ')}`,
    );

    return this.getProfile(userId);
  }

  async deleteAccount(user: User, accessToken: string): Promise<void> {
    // 1. Soft delete the user
    await this.userRepository.update(user.id, {
      status: UserStatus.DELETED,
    });
    await this.userRepository.softDelete(user.id);

    // 2. Revoke all refresh tokens
    await this.refreshTokenRepository.update(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );

    // 3. Blacklist current access token
    await this.blacklistAccessToken(accessToken, user.id);

    // 4. Clear all sessions
    await this.revokeAllUserSessions(user.id);

    this.logger.log(`Account deleted: userId=${user.id}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Public Helpers (used by controller)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Safely decode a JWT without verification.
   * Returns typed JwtPayload or null.
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      const decoded: unknown = this.jwtService.decode(token);
      if (decoded && typeof decoded === 'object') {
        return decoded as JwtPayload;
      }
      return null;
    } catch {
      return null;
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Private Helper Methods
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async blacklistAccessToken(
    accessToken: string,
    userId: string,
  ): Promise<void> {
    const decoded: JwtPayload | null = this.decodeToken(accessToken);
    if (!decoded?.exp || !decoded?.iat) return;

    const ttl: number = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      const blacklistKey = `${AUTH.BLACKLIST_PREFIX}${userId}:${String(decoded.iat)}`;
      await this.redisService.set(blacklistKey, '1', ttl);
    }
  }

  private async revokeTokenFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.update({ familyId }, { isRevoked: true });
    this.logger.warn(`Token family revoked: familyId=${familyId}`);
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const userSessionsKey = `${AUTH.USER_SESSIONS_PREFIX}${userId}`;
    const tokenIds: string[] =
      await this.redisService.setMembers(userSessionsKey);

    for (const tokenId of tokenIds) {
      const sessionKey = `${AUTH.SESSION_PREFIX}${userId}:${tokenId}`;
      await this.redisService.del(sessionKey);
    }

    await this.redisService.del(userSessionsKey);
  }

  private async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    const accounts = await this.oauthAccountRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    return accounts.map((account) => ({
      provider: account.provider,
      email: account.providerEmail,
      linkedAt: account.createdAt,
    }));
  }

  private sanitizeUser(
    user: User,
    linkedAccounts: LinkedAccount[],
  ): SanitizedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      role: user.role,
      subscriptionActive: false,
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      linkedAccounts,
    };
  }

  private isApplePrivateRelay(email: string): boolean {
    return email.endsWith('@privaterelay.appleid.com');
  }
}
