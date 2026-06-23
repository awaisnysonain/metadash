import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 20,
    });
    pool.on('error', err => console.error('[db] pool error', err));
  }
  return pool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function initDatabase(): Promise<boolean> {
  const db = getPool();
  if (!db) {
    console.warn('[db] DATABASE_URL not set — API will run without persistence');
    return false;
  }

  try {
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await db.query(sql);
    console.log('[db] Schema ready (erp_meta_dashboard)');
    return true;
  } catch (err) {
    console.error('[db] init failed', err);
    return false;
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const db = getPool();
  if (!db) throw new Error('Database not configured');
  return db.query<T>(text, params);
}
