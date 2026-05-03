import { UserRole } from '../enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string | null;
  type: 'access' | 'refresh';
  role?: UserRole;
  subscriptionActive?: boolean;
  jti?: string;
  family?: string;
  iat?: number;
  exp?: number;
}
