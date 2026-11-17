/**
 * Vercel Postgres client.
 * Uses POSTGRES_URL from env. If POSTGRES_URL is the direct (non-pooling) connection string,
 * we use createClient() so the default sql (which expects a pooled URL) does not throw.
 * Never concatenate user input into SQL—use parameterized queries.
 */
import { createClient, createPool, type VercelPoolClient } from "@vercel/postgres";
import {
  DatabaseQuotaError,
  assertDatabaseOpen,
  looksLikeQuota,
  tripDatabaseQuota,
} from "@/lib/db-guard";

/**
 * Tagged SQL the rest of the app uses. Each call may use a different connection,
 * so it cannot hold a transaction open across statements.
 */
export type DbSql = VercelPoolClient["sql"];

type TxClient = {
  sql: DbSql;
  release: (err?: Error | boolean) => void;
};

let sqlExport: DbSql;
let checkout: () => Promise<TxClient>;

function guardCall<T>(run: () => Promise<T>): Promise<T> {
  try {
    assertDatabaseOpen();
  } catch (err) {
    return Promise.reject(err);
  }
  return run().catch((err: unknown) => {
    if (looksLikeQuota(err)) {
      tripDatabaseQuota();
      throw new DatabaseQuotaError();
    }
    throw err;
  });
}

function guardSql(raw: DbSql): DbSql {
  return ((strings: TemplateStringsArray, ...values: never[]) =>
    guardCall(() => raw(strings, ...values))) as DbSql;
}

try {
  const pool = createPool();
  sqlExport = guardSql(pool.sql.bind(pool));
  checkout = async () => {
    assertDatabaseOpen();
    try {
      const client = await pool.connect();
      return {
        sql: guardSql(client.sql.bind(client)),
        release: (err) => client.release(err),
      };
    } catch (err) {
      if (looksLikeQuota(err)) {
        tripDatabaseQuota();
        throw new DatabaseQuotaError();
      }
      throw err;
    }
  };
} catch (err) {
  const e = err as { code?: string; message?: string };
  if (e?.code === "missing_connection_string") {
    throw new Error(
      "POSTGRES_URL is not set. Add it in Vercel → Project → Settings → Environment Variables."
    );
  }
  if (e?.code === "invalid_connection_string") {
    console.warn(
      "[db] POSTGRES_URL does not contain \"-pooler.\"; using direct connection (queries may be slow or time out). Use the pooled URL from Vercel (Storage → Postgres → Connect)."
    );
    const connectionString = process.env.POSTGRES_URL;
    const client = createClient({ connectionString });
    sqlExport = guardSql(client.sql.bind(client));
    checkout = async () => {
      assertDatabaseOpen();
      const txClient = createClient({ connectionString });
      try {
        await txClient.connect();
      } catch (connectErr) {
        if (looksLikeQuota(connectErr)) {
          tripDatabaseQuota();
          throw new DatabaseQuotaError();
        }
        throw connectErr;
      }
      return {
        sql: guardSql(txClient.sql.bind(txClient)),
        release: () => {
          void txClient.end().catch((endErr) => {
            console.error("[db] failed to close transaction client", endErr);
          });
        },
      };
    };
  } else {
    throw err;
  }
}

export const sql = sqlExport;

/** Run `fn` on one connected client. Rolls back and releases the client if any statement throws. */
export async function withTransaction<T>(fn: (tx: DbSql) => Promise<T>): Promise<T> {
  const client = await checkout();
  let released = false;
  const release = (err?: Error | boolean) => {
    if (released) return;
    released = true;
    client.release(err);
  };
  try {
    await client.sql`BEGIN`;
    const result = await fn(client.sql);
    await client.sql`COMMIT`;
    return result;
  } catch (err) {
    try {
      await client.sql`ROLLBACK`;
    } catch (rollbackErr) {
      release(rollbackErr instanceof Error ? rollbackErr : true);
      throw err;
    }
    throw err;
  } finally {
    release();
  }
}
