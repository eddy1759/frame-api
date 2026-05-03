import { OAuthUserInfo } from '../interfaces/oauth-user-info.interface';
import { OAuthProvider } from '../enums/oauth-provider.enum';

export interface IOAuthProvider {
  /**
   * Verify the token received from the mobile client and
   * return normalized user information.
   */
  validateToken(
    token: string,
    additionalData?: Record<string, unknown>,
  ): Promise<OAuthUserInfo>;

  /**
   * Get the provider identifier.
   */
  getProviderName(): OAuthProvider;
}
