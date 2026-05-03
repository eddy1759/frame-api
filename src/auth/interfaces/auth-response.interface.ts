import { TokenPair } from './token-pair.interface';

export interface SanitizedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  role: string;
  subscriptionActive: boolean;
  storageUsed: number;
  storageLimit: number;
  createdAt: Date;
  lastLoginAt: Date | null;
  linkedAccounts: LinkedAccount[];
}

export interface LinkedAccount {
  provider: string;
  email: string | null;
  linkedAt: Date;
}

export interface AuthResponse extends TokenPair {
  user: SanitizedUser;
  isNewUser: boolean;
}
