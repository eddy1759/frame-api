import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { OAuthLoginDto } from './dto/oauth-login.dto';
import { AdminSignInDto } from './dto/admin-signin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { OAuthProvider } from './enums/oauth-provider.enum';
import {
  AuthResponse,
  SanitizedUser,
  TokenPair,
  DeviceInfo,
} from './interfaces';
import { AuthThrottleGuard } from './guards/custom-throttle.guard';
import { BruteForceGuard } from './guards/brute-force.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly throttleGuard: AuthThrottleGuard,
    private readonly bruteForceGuard: BruteForceGuard,
  ) {}

  // ═══════════════════════════════════════════
  // OAuth Login
  // ═══════════════════════════════════════════

  @Public()
  @Post('admin/signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in an admin user with email and password' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid admin credentials' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async adminSignIn(
    @Body() dto: AdminSignInDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 5,
      ttlSeconds: 300,
    });

    const ip: string = req.ip ?? 'unknown';
    const emailKey = this.getAdminEmailThrottleKey(dto.email);

    await this.bruteForceGuard.checkBruteForce(ip);
    await this.bruteForceGuard.checkBruteForce(emailKey);

    try {
      const result = await this.authService.adminPasswordSignIn(
        dto.email,
        dto.password,
        dto.deviceInfo,
        ip,
      );

      await this.bruteForceGuard.resetAttempts(ip);
      await this.bruteForceGuard.resetAttempts(emailKey);
      return result;
    } catch (error: unknown) {
      if (this.isUnauthorizedError(error)) {
        await this.bruteForceGuard.recordFailedAttempt(ip);
        await this.bruteForceGuard.recordFailedAttempt(emailKey);
      }
      throw error;
    }
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Google' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid Google token' })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async googleLogin(
    @Body() dto: OAuthLoginDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 10,
      ttlSeconds: 60,
    });

    const ip: string = req.ip ?? 'unknown';
    await this.bruteForceGuard.checkBruteForce(ip);

    try {
      const result = await this.authService.oauthLogin(
        OAuthProvider.GOOGLE,
        dto.token,
        undefined,
        dto.deviceInfo,
        ip,
      );

      await this.bruteForceGuard.resetAttempts(ip);
      return result;
    } catch (error: unknown) {
      if (this.isUnauthorizedError(error)) {
        await this.bruteForceGuard.recordFailedAttempt(ip);
      }
      throw error;
    }
  }

  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Apple' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid Apple token' })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async appleLogin(
    @Body() dto: OAuthLoginDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 10,
      ttlSeconds: 60,
    });

    const ip: string = req.ip ?? 'unknown';
    await this.bruteForceGuard.checkBruteForce(ip);

    try {
      const result = await this.authService.oauthLogin(
        OAuthProvider.APPLE,
        dto.token,
        { fullName: dto.fullName },
        dto.deviceInfo,
        ip,
      );

      await this.bruteForceGuard.resetAttempts(ip);
      return result;
    } catch (error: unknown) {
      if (this.isUnauthorizedError(error)) {
        await this.bruteForceGuard.recordFailedAttempt(ip);
      }
      throw error;
    }
  }

  // ═══════════════════════════════════════════
  // Token Refresh
  // ═══════════════════════════════════════════

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<TokenPair> {
    await this.throttleGuard.checkRateLimit(req, {
      limit: 20,
      ttlSeconds: 60,
    });

    return this.authService.refreshTokens(
      dto.refreshToken,
      undefined,
      req.ip ?? undefined,
    );
  }

  // ═══════════════════════════════════════════
  // User Profile
  // ═══════════════════════════════════════════

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: User): Promise<SanitizedUser> {
    return this.authService.getProfile(user.id);
  }

  @Put('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<SanitizedUser> {
    return this.authService.updateProfile(user.id, dto);
  }

  @Delete('me')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete account (soft delete)' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteAccount(
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const accessToken: string = this.extractToken(req);
    await this.authService.deleteAccount(user, accessToken);
    return { message: 'Account deleted successfully.' };
  }

  // ═══════════════════════════════════════════
  // Logout
  // ═══════════════════════════════════════════

  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
  ): Promise<{ message: string }> {
    const accessToken: string = this.extractToken(req);
    await this.authService.logout(user, accessToken, body.refreshToken);
    return { message: 'Logged out successfully.' };
  }

  @Post('logout-all')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout all sessions' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logoutAll(
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const accessToken: string = this.extractToken(req);
    await this.authService.logoutAll(user, accessToken);
    return { message: 'All sessions revoked successfully.' };
  }

  // ═══════════════════════════════════════════
  // Session Management
  // ═══════════════════════════════════════════

  @Get('sessions')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List active sessions' })
  @ApiResponse({ status: 200, description: 'Active sessions returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSessions(
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<{
    sessions: Array<{
      id: string;
      deviceInfo: DeviceInfo | null;
      ipAddress: string | null;
      createdAt: string;
      current: boolean;
    }>;
  }> {
    // FIX #6: Use DeviceInfo type (not Record<string, string>) and use the
    // public decodeToken method to avoid private member access
    const accessToken: string = this.extractToken(req);
    const decoded = this.authService.decodeToken(accessToken);
    const currentTokenId: string | undefined = decoded?.jti ?? undefined;

    const sessions = await this.authService.getActiveSessions(
      user.id,
      currentTokenId,
    );

    return { sessions };
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID to revoke' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Session not found' })
  async revokeSession(
    @CurrentUser() user: User,
    @Param('sessionId') sessionId: string,
  ): Promise<{ message: string }> {
    await this.authService.revokeSession(user.id, sessionId);
    return { message: 'Session revoked successfully.' };
  }

  // ═══════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════

  private extractToken(req: Request): string {
    const authHeader: string | undefined = req.headers.authorization;
    if (!authHeader) return '';
    return authHeader.replace('Bearer ', '');
  }

  private isUnauthorizedError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
      return (error as { status: number }).status === 401;
    }
    return false;
  }

  private getAdminEmailThrottleKey(email: string): string {
    return `admin-email:${email.trim().toLowerCase()}`;
  }
}
