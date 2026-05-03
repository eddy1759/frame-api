/* eslint-disable @typescript-eslint/no-base-to-string */
// src/auth/providers/apple-oauth.provider.ts

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as appleSignin from 'apple-signin-auth';
import { IOAuthProvider } from './oauth-provider.interface';
import { OAuthUserInfo } from '../interfaces/oauth-user-info.interface';
import { OAuthProvider } from '../enums/oauth-provider.enum';

@Injectable()
export class AppleOAuthProvider implements IOAuthProvider {
  private readonly logger = new Logger(AppleOAuthProvider.name);
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('APPLE_CLIENT_ID', '');
  }

  async validateToken(
    identityToken: string,
    additionalData?: Record<string, unknown>,
  ): Promise<OAuthUserInfo> {
    try {
      // FIX #7: Don't force-type the return value.
      // Use the library's own return type and access properties safely.
      const payload = await appleSignin.verifyIdToken(identityToken, {
        audience: this.clientId,
        ignoreExpiration: false,
      });

      // Access sub safely — verifyIdToken returns AppleIdTokenType
      const sub: string | undefined =
        typeof payload === 'object' && payload !== null
          ? ((payload as unknown as Record<string, unknown>).sub as
              | string
              | undefined)
          : undefined;

      if (!sub) {
        throw new UnauthorizedException({
          code: 'AUTH_PROVIDER_TOKEN_INVALID',
          message: 'Apple token missing subject identifier.',
        });
      }

      const email: string | undefined = (
        payload as unknown as Record<string, unknown>
      ).email as string | undefined;
      const isPrivateEmail: unknown = (
        payload as unknown as Record<string, unknown>
      ).is_private_email;

      // Apple only sends the user's name on the FIRST authentication.
      let displayName: string | null = null;
      if (additionalData?.fullName) {
        const fullName = additionalData.fullName as {
          firstName?: string;
          lastName?: string;
        };
        const parts: string[] = [fullName.firstName, fullName.lastName].filter(
          (part): part is string => typeof part === 'string' && part.length > 0,
        );
        displayName = parts.length > 0 ? parts.join(' ') : null;
      }

      this.logger.log(
        `Apple token verified: sub=${sub}, email=${email ?? 'none'}, privateRelay=${String(isPrivateEmail ?? false)}`,
      );

      // Build rawProfile as a plain object
      const rawProfile: Record<string, unknown> = {};
      if (typeof payload === 'object' && payload !== null) {
        Object.assign(rawProfile, payload);
      }

      return {
        providerId: sub,
        email: email ?? null,
        displayName,
        avatarUrl: null, // Apple never provides an avatar
        rawProfile,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        `Apple token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      throw new UnauthorizedException({
        code: 'AUTH_PROVIDER_TOKEN_INVALID',
        message:
          'Failed to verify Apple identity token. Token may be expired or invalid.',
      });
    }
  }

  getProviderName(): OAuthProvider {
    return OAuthProvider.APPLE;
  }
}
