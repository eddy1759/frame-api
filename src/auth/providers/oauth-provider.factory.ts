import { Injectable, BadRequestException } from '@nestjs/common';
import { IOAuthProvider } from './oauth-provider.interface';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { AppleOAuthProvider } from './apple-oauth.provider';
import { OAuthProvider } from '../enums/oauth-provider.enum';

@Injectable()
export class OAuthProviderFactory {
  private readonly providers: Map<OAuthProvider, IOAuthProvider>;

  constructor(
    private readonly googleProvider: GoogleOAuthProvider,
    private readonly appleProvider: AppleOAuthProvider,
  ) {
    this.providers = new Map<OAuthProvider, IOAuthProvider>([
      [OAuthProvider.GOOGLE, this.googleProvider],
      [OAuthProvider.APPLE, this.appleProvider],
    ]);
  }

  getProvider(provider: OAuthProvider): IOAuthProvider {
    const oauthProvider = this.providers.get(provider);

    if (!oauthProvider) {
      throw new BadRequestException({
        code: 'AUTH_UNSUPPORTED_PROVIDER',
        message: `OAuth provider '${provider}' is not supported. Supported providers: ${Array.from(this.providers.keys()).join(', ')}`,
      });
    }

    return oauthProvider;
  }
}
