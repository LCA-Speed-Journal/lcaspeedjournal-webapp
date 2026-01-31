/**
 * Vercel Postgres client.
 * Uses POSTGRES_URL from env. If POSTGRES_URL is the direct (non-pooling) connection string,
 * we use createClient() so the default sql (which expects a pooled URL) does not throw.
 * Never concatenate user input into SQL—use parameterized queries.
 */
import { createClient, createPool } from "@vercel/postgres";

let sqlExport: ReturnType<typeof createPool>["sql"];

try {
  const pool = createPool();
  sqlExport = pool.sql.bind(pool);
} catch (err) {
  const e = err as { code?: string };
  if (e?.code === "invalid_connection_string") {
    console.warn(
      "[db] POSTGRES_URL does not contain \"-pooler.\"; using direct connection (queries may be slow or time out). Use the pooled URL from Vercel (Storage → Postgres → Connect)."
    );
    const client = createClient({
      connectionString: process.env.POSTGRES_URL,
    });
    sqlExport = client.sql.bind(client);
  } else {
    throw err;
  }
}

export const sql = sqlExport;
