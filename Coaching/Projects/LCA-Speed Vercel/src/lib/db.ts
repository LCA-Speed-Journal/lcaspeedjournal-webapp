/**
 * Vercel Postgres client.
 * Uses POSTGRES_URL from env. Never concatenate user input into SQL—use parameterized queries.
 */
import { sql } from "@vercel/postgres";

export { sql };
