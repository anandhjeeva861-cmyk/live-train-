import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

dotenv.config({ quiet: true });
export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' }),
});

// Serialize SQLite write transactions in this process; database constraints and
// conditional updates remain the authority for competing processes.
let writes = Promise.resolve();
export function writeTransaction(work) {
  const next = writes.then(() => prisma.$transaction(work, { timeout: 15000 }));
  writes = next.catch(() => {});
  return next;
}
