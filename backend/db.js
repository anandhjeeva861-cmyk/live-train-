import dotenv from 'dotenv';

dotenv.config({ quiet: true });
export const cloudDatabase = /^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '');
async function createClient() {
  if (cloudDatabase) {
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import('../generated/cloud-client/index.js'), import('@prisma/adapter-pg')]);
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 }) });
  }
  if (process.env.VERCEL === '1') throw new Error('Vercel requires a PostgreSQL DATABASE_URL. Local SQLite is for development only.');
  const [{ PrismaClient }, { PrismaBetterSqlite3 }] = await Promise.all([import('@prisma/client'), import('@prisma/adapter-better-sqlite3')]);
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' }) });
}
export const prisma = await createClient();

// Serialize SQLite write transactions in this process; database constraints and
// conditional updates remain the authority for competing processes.
let writes = Promise.resolve();
export function writeTransaction(work) {
  const next = writes.then(async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await prisma.$transaction(work, { timeout: 15000, ...(cloudDatabase && { isolationLevel: 'Serializable' }) }); }
      catch (error) { if (!cloudDatabase || error.code !== 'P2034' || attempt >= 2) throw error; }
    }
  });
  writes = next.catch(() => {});
  return next;
}
