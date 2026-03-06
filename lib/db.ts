import { Pool } from "pg";
import { env } from "@/lib/env";

declare global {
  var __leadbasePool: Pool | undefined;
}

const pool =
  global.__leadbasePool ??
  new Pool({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    max: 20,
    idleTimeoutMillis: 30000,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  });

if (env.NODE_ENV !== "production") {
  global.__leadbasePool = pool;
}

export default pool;
