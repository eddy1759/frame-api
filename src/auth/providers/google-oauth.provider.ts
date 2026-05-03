import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { IOAuthProvider } from './oauth-provider.interface';
import { OAuthUserInfo } from '../interfaces/oauth-user-info.interface';
import { OAuthProvider } from '../enums/oauth-provider.enum';

@Injectable()
export class GoogleOAuthProvider implements IOAuthProvider {
  private readonly logger = new Logger(GoogleOAuthProvider.name);
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    if (!this.clientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured');
    }
    this.client = new OAuth2Client(this.clientId);
  }

  async validateToken(idToken: string): Promise<OAuthUserInfo> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });

      const payload: TokenPayload | undefined = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException({
          code: 'AUTH_PROVIDER_TOKEN_INVALID',
          message: 'Google token payload is empty.',
        });
      }

      if (!payload.sub) {
        throw new UnauthorizedException({
          code: 'AUTH_PROVIDER_TOKEN_INVALID',
          message: 'Google token missing subject identifier.',
        });
      }

      if (
        payload.iss !== 'https://accounts.google.com' &&
        payload.iss !== 'accounts.google.com'
      ) {
        throw new UnauthorizedException({
          code: 'AUTH_PROVIDER_TOKEN_INVALID',
          message: 'Invalid token issuer.',
        });
      }

      if (payload.aud !== this.clientId) {
        throw new UnauthorizedException({
          code: 'AUTH_PROVIDER_TOKEN_INVALID',
          message: 'Invalid token audience.',
        });
      }

      if (!payload.email_verified) {
        throw new UnauthorizedException({
          code: 'AUTH_PROVIDER_EMAIL_NOT_VERIFIED',
          message: 'Google email is not verified.',
        });
      }

      this.logger.log(
        `Google token verified: sub=${payload.sub}, email=${payload.email}`,
      );

      return {
        providerId: payload.sub,
        email: payload.email || null,
        displayName: payload.name || null,
        avatarUrl: payload.picture || null,
        rawProfile: payload as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        `Google token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      throw new UnauthorizedException({
        code: 'AUTH_PROVIDER_TOKEN_INVALID',
        message:
          'Failed to verify Google token. Token may be expired or invalid.',
      });
    }
  }

  getProviderName(): OAuthProvider {
    return OAuthProvider.GOOGLE;
  }
}
