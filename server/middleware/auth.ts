import type { Request, Response, NextFunction } from 'express';
import { verifyToken, hasPermission, type AuthUser, type Permission } from '../lib/auth.js';
import { getUserById } from '../db/user-repository.js';
import { isEnvAdminId, buildEnvAdmin } from '../lib/env-admin.js';
import { isDatabaseConfigured } from '../db/pool.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

async function resolveUser(userId: string): Promise<AuthUser | null> {
  if (isEnvAdminId(userId)) {
    return buildEnvAdmin();
  }

  if (!isDatabaseConfigured()) return null;
  return getUserById(userId);
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = await resolveUser(payload.sub);
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }

  req.user = user;
  next();
}

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const allowed = permissions.some(p => hasPermission(user, p));
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
