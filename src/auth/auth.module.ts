import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';

import { User } from './entities/user.entity';
import { OAuthAccount } from './entities/oauth-account.entity';
import { RefreshToken } from './entities/refresh-token.entity';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthThrottleGuard } from './guards/custom-throttle.guard';
import { BruteForceGuard } from './guards/brute-force.guard';

import { GoogleOAuthProvider } from './providers/google-oauth.provider';
import { AppleOAuthProvider } from './providers/apple-oauth.provider';
import { OAuthProviderFactory } from './providers/oauth-provider.factory';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OAuthAccount, RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],

  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    GoogleOAuthProvider,
    AppleOAuthProvider,
    OAuthProviderFactory,
    AuthThrottleGuard,
    BruteForceGuard,
  ],
  exports: [AuthService, OAuthProviderFactory],
})
export class AuthModule {}
