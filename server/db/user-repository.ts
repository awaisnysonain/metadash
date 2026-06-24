import { query } from './pool.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  type AuthUser,
  type Permission,
  ALL_PERMISSIONS,
  defaultMemberPermissions,
} from '../lib/auth.js';

function rowToUser(row: Record<string, unknown>): AuthUser {
  const perms = Array.isArray(row.permissions)
    ? (row.permissions as Permission[])
    : typeof row.permissions === 'string'
      ? (JSON.parse(row.permissions) as Permission[])
      : [];

  return {
    id: row.id as string,
    username: row.username as string,
    name: row.name as string,
    email: (row.email as string) ?? '',
    role: row.role as 'admin' | 'member',
    title: (row.title as string) ?? '',
    bio: (row.bio as string) ?? '',
    avatarUrl: (row.avatar_url as string) ?? '',
    permissions: row.role === 'admin' ? [...ALL_PERMISSIONS] : perms,
    isActive: row.is_active !== false,
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

export function sanitizeUser(user: AuthUser): Omit<AuthUser, never> {
  return user;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await query('SELECT * FROM app_users WHERE id = $1', [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByUsername(username: string): Promise<(AuthUser & { passwordHash: string }) | null> {
  const { rows } = await query('SELECT * FROM app_users WHERE username = $1', [username]);
  if (!rows[0]) return null;
  return { ...rowToUser(rows[0]), passwordHash: rows[0].password_hash as string };
}

export async function getAllUsers(): Promise<AuthUser[]> {
  const { rows } = await query('SELECT * FROM app_users ORDER BY name');
  return rows.map(rowToUser);
}

export async function authenticateDbUser(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const user = await getUserByUsername(username);
  if (!user || !user.isActive) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const now = new Date().toISOString();
  await query('UPDATE app_users SET last_login_at = $1, updated_at = $1 WHERE id = $2', [now, user.id]);

  const { passwordHash: _, ...authUser } = user;
  return { ...authUser, lastLoginAt: now };
}

export async function createUser(input: {
  id: string;
  username: string;
  password: string;
  name: string;
  email?: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
  permissions?: Permission[];
}): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);
  const permissions = input.permissions ?? defaultMemberPermissions();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO app_users (id, username, password_hash, name, email, role, title, bio, avatar_url, permissions, is_active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'member',$6,$7,$8,$9,TRUE,$10,$10)`,
    [
      input.id,
      input.username,
      passwordHash,
      input.name,
      input.email ?? '',
      input.title ?? '',
      input.bio ?? '',
      input.avatarUrl ?? '',
      JSON.stringify(permissions),
      now,
    ]
  );

  await query(
    `INSERT INTO team_members (id, name, email, role, avatar_url) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET name=$2, email=$3, role=$4, avatar_url=$5`,
    [input.id, input.name, input.email ?? '', input.title || 'member', input.avatarUrl ?? '']
  );

  const user = await getUserById(input.id);
  if (!user) throw new Error('Failed to create user');
  return user;
}

export async function updateUserProfile(
  id: string,
  fields: { name?: string; email?: string; title?: string; bio?: string; avatarUrl?: string }
): Promise<AuthUser | null> {
  const sets: string[] = ['updated_at = $1'];
  const vals: unknown[] = [new Date().toISOString()];
  let i = 2;

  if (fields.name !== undefined) { sets.push(`name = $${i++}`); vals.push(fields.name); }
  if (fields.email !== undefined) { sets.push(`email = $${i++}`); vals.push(fields.email); }
  if (fields.title !== undefined) { sets.push(`title = $${i++}`); vals.push(fields.title); }
  if (fields.bio !== undefined) { sets.push(`bio = $${i++}`); vals.push(fields.bio); }
  if (fields.avatarUrl !== undefined) { sets.push(`avatar_url = $${i++}`); vals.push(fields.avatarUrl); }

  vals.push(id);
  await query(`UPDATE app_users SET ${sets.join(', ')} WHERE id = $${i}`, vals);

  if (fields.name || fields.email || fields.title || fields.avatarUrl) {
    const user = await getUserById(id);
    if (user) {
      await query(
        `UPDATE team_members SET name = $1, email = $2, role = $3, avatar_url = $4 WHERE id = $5`,
        [user.name, user.email, user.title || user.role, user.avatarUrl, id]
      );
    }
  }

  return getUserById(id);
}

export async function updateUserByAdmin(
  id: string,
  fields: {
    name?: string;
    email?: string;
    title?: string;
    bio?: string;
    avatarUrl?: string;
    role?: 'admin' | 'member';
    permissions?: Permission[];
    isActive?: boolean;
    password?: string;
  }
): Promise<AuthUser | null> {
  const sets: string[] = ['updated_at = $1'];
  const vals: unknown[] = [new Date().toISOString()];
  let i = 2;

  if (fields.name !== undefined) { sets.push(`name = $${i++}`); vals.push(fields.name); }
  if (fields.email !== undefined) { sets.push(`email = $${i++}`); vals.push(fields.email); }
  if (fields.title !== undefined) { sets.push(`title = $${i++}`); vals.push(fields.title); }
  if (fields.bio !== undefined) { sets.push(`bio = $${i++}`); vals.push(fields.bio); }
  if (fields.avatarUrl !== undefined) { sets.push(`avatar_url = $${i++}`); vals.push(fields.avatarUrl); }
  if (fields.role !== undefined) { sets.push(`role = $${i++}`); vals.push(fields.role); }
  if (fields.permissions !== undefined) { sets.push(`permissions = $${i++}`); vals.push(JSON.stringify(fields.permissions)); }
  if (fields.isActive !== undefined) { sets.push(`is_active = $${i++}`); vals.push(fields.isActive); }
  if (fields.password) {
    const hash = await hashPassword(fields.password);
    sets.push(`password_hash = $${i++}`);
    vals.push(hash);
  }

  vals.push(id);
  await query(`UPDATE app_users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  return updateUserProfile(id, fields);
}

export async function recordCommentView(commentId: string, userId: string, userName: string) {
  const id = `view-${commentId}-${userId}`;
  await query(
    `INSERT INTO comment_views (id, comment_id, user_id, user_name, viewed_at)
     VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (comment_id, user_id) DO UPDATE SET viewed_at = NOW()`,
    [id, commentId, userId, userName]
  );
}

export async function getCommentViews(commentId: string) {
  const { rows } = await query(
    'SELECT user_id, user_name, viewed_at FROM comment_views WHERE comment_id = $1 ORDER BY viewed_at DESC',
    [commentId]
  );
  return rows.map(r => ({
    userId: r.user_id as string,
    userName: r.user_name as string,
    viewedAt: String(r.viewed_at),
  }));
}

export async function removeStaleAdminFromDb() {
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || 'oh.awais';
  const { rowCount } = await query('DELETE FROM app_users WHERE username = $1 OR id = $2', [
    adminUsername,
    'user-admin',
  ]);
  if (rowCount && rowCount > 0) {
    console.log(`[auth] Removed ${rowCount} stale admin row(s) from database — admin is env-only`);
  }
}
