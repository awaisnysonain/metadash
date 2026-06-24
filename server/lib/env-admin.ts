import { verifyPassword, hashPassword } from './password.js';
import type { AuthUser } from './auth.js';
import { ALL_PERMISSIONS } from './auth.js';

/** Fixed ID for the env-based admin — never stored in the database. */
export const ENV_ADMIN_ID = 'env-admin';

let cachedPasswordHash: string | null = null;
const profileOverrides = new Map<string, Partial<AuthUser>>();

export function getEnvAdminUsername(): string {
  return process.env.ADMIN_USERNAME?.trim() || 'oh.awais';
}

export function getEnvAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || '@Nysonian.0.';
}

export function isEnvAdminUsername(username: string): boolean {
  return username.trim() === getEnvAdminUsername();
}

export function isEnvAdminId(id: string): boolean {
  return id === ENV_ADMIN_ID;
}

async function getStoredHash(): Promise<string> {
  if (!cachedPasswordHash) {
    cachedPasswordHash = await hashPassword(getEnvAdminPassword());
  }
  return cachedPasswordHash;
}

export function isEnvAdminConfigured(): boolean {
  return Boolean(getEnvAdminUsername() && getEnvAdminPassword());
}

export async function verifyEnvAdminLogin(username: string, password: string): Promise<AuthUser | null> {
  if (!isEnvAdminConfigured()) return null;
  if (!isEnvAdminUsername(username)) return null;

  const hash = await getStoredHash();
  const valid = await verifyPassword(password, hash);
  if (!valid) return null;

  return buildEnvAdmin();
}

export function buildEnvAdmin(): AuthUser {
  const overrides = profileOverrides.get(ENV_ADMIN_ID) ?? {};
  return {
    id: ENV_ADMIN_ID,
    username: getEnvAdminUsername(),
    name: overrides.name ?? (process.env.ADMIN_NAME?.trim() || 'Awais'),
    email: overrides.email ?? (process.env.ADMIN_EMAIL?.trim() || 'awais@nysonik.com'),
    role: 'admin',
    title: overrides.title ?? (process.env.ADMIN_TITLE?.trim() || 'Administrator'),
    bio: overrides.bio ?? (process.env.ADMIN_BIO?.trim() || 'MetaDash platform administrator'),
    avatarUrl: overrides.avatarUrl ?? (process.env.ADMIN_AVATAR_URL?.trim() || ''),
    permissions: [...ALL_PERMISSIONS],
    isActive: true,
    lastLoginAt: new Date().toISOString(),
  };
}

export function getEnvAdmin(): AuthUser | null {
  if (!isEnvAdminConfigured()) return null;
  return buildEnvAdmin();
}

export function updateEnvAdminProfile(
  fields: Partial<Pick<AuthUser, 'name' | 'email' | 'title' | 'bio' | 'avatarUrl'>>
): AuthUser | null {
  const current = profileOverrides.get(ENV_ADMIN_ID) ?? {};
  profileOverrides.set(ENV_ADMIN_ID, { ...current, ...fields });
  return buildEnvAdmin();
}
