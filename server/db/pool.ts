import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;
let dbConnected = false;

export function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost')
        ? undefined
        : process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
      max: 20,
    });
    pool.on('error', err => console.error('[db] pool error', err));
  }
  return pool;
}

export function isDatabaseConfigured(): boolean {
  return dbConnected;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function initDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL not set — API will run without persistence');
    return false;
  }

  try {
    const db = getPool();
    if (!db) return false;

    await db.query('SELECT 1');
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await db.query(sql);
    dbConnected = true;
    console.log('[db] Schema ready (erp_meta_dashboard)');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[db] Connection failed — API will run without persistence (${msg})`);
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
    dbConnected = false;
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
