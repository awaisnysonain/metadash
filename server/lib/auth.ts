import jwt from 'jsonwebtoken';

export const ALL_PERMISSIONS = [
  'inbox.view',
  'inbox.manage',
  'comments.reply',
  'comments.assign',
  'comments.notes',
  'comments.tags',
  'campaigns.view',
  'reports.view',
  'team.view',
  'team.manage',
  'settings.view',
  'settings.manage',
  'sync.run',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  title: string;
  bio: string;
  avatarUrl: string;
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: 'admin' | 'member';
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    return 'metadash-dev-secret-change-in-production';
  }
  return secret;
}

export function signToken(user: { id: string; username: string; role: 'admin' | 'member' }): string {
  const payload: JwtPayload = { sub: user.id, username: user.username, role: user.role };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  if (user.role === 'admin') return true;
  return user.permissions.includes(permission);
}

export function defaultMemberPermissions(): Permission[] {
  return ['inbox.view', 'comments.reply', 'comments.notes', 'campaigns.view', 'reports.view', 'team.view'];
}
