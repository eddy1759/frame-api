import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { GoogleOAuthProvider } from '../../providers/google-oauth.provider';
import { OAuthProvider } from '../../enums/oauth-provider.enum';

// Mock google-auth-library
jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    __mockVerifyIdToken: mockVerifyIdToken,
  };
});

describe('GoogleOAuthProvider', () => {
  let provider: GoogleOAuthProvider;
  let mockVerifyIdToken: jest.Mock;

  beforeEach(async () => {
    const googleAuthLib = jest.requireMock('google-auth-library');
    mockVerifyIdToken = googleAuthLib.__mockVerifyIdToken;
    mockVerifyIdToken.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-google-client-id'),
          },
        },
      ],
    }).compile();

    provider = module.get<GoogleOAuthProvider>(GoogleOAuthProvider);
  });

  it('should return normalized user info for valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-user-123',
        iss: 'https://accounts.google.com',
        aud: 'test-google-client-id',
        email_verified: true,
        email: 'user@gmail.com',
        name: 'John Doe',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      }),
    });

    const result = await provider.validateToken('valid-id-token');

    expect(result.providerId).toBe('google-user-123');
    expect(result.email).toBe('user@gmail.com');
    expect(result.displayName).toBe('John Doe');
    expect(result.avatarUrl).toBe(
      'https://lh3.googleusercontent.com/photo.jpg',
    );
  });

  it('should handle null email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-user-456',
        iss: 'https://accounts.google.com',
        aud: 'test-google-client-id',
        email_verified: true,
        name: 'No Email User',
      }),
    });

    const result = await provider.validateToken('valid-token');

    expect(result.email).toBeNull();
    expect(result.providerId).toBe('google-user-456');
  });

  it('should throw UnauthorizedException for invalid token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    await expect(provider.validateToken('invalid-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw when payload is empty', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => null,
    });

    await expect(
      provider.validateToken('token-with-no-payload'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should return correct provider name', () => {
    expect(provider.getProviderName()).toBe(OAuthProvider.GOOGLE);
  });
});
