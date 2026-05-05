// src/db/index.ts
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { logger } from "../middleware/logger";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
      "Check your .env file (format: postgresql://user:pass@host:5432/dbname)"
    );
  }

  pool = new Pool({
    connectionString,
    max: 20,                        
    min: 2,                       
    idleTimeoutMillis: 30_000,      
    connectionTimeoutMillis: 5_000, 
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  pool.on("error", (err, client) => {
    logger.error("Unexpected error on idle PostgreSQL client", {
      error: err.message,
      stack: err.stack,
    });
  });

  pool.on("connect", () => {
    logger.debug("New PostgreSQL connection established");
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const db = getPool();

  try {
    const result = await db.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug("SQL query executed", {
      query: text.slice(0, 120), 
      duration_ms: duration,
      rows: result.rowCount,
    });
    return result;
  } catch (err) {
    logger.error("SQL query failed", {
      query: text.slice(0, 120),
      params,
      error: err instanceof Error ? err.message : err,
    });
    throw err;
  }
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await query<{ now: string }>("SELECT NOW() as now");
    logger.info("PostgreSQL connected", { serverTime: result.rows[0]?.now });
    return true;
  } catch (err) {
    logger.error("PostgreSQL connection failed", {
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("PostgreSQL pool closed");
  }
}

process.once("SIGINT",  () => closePool());
process.once("SIGTERM", () => closePool());