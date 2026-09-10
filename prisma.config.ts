import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
// Prisma's Windows engine needs an existing local file for an absolute SQLite URL.
if (databaseUrl.startsWith('file:')) {
  const file = path.resolve(databaseUrl.slice(5));
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, '', { flag: 'wx' });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  datasource: { url: databaseUrl.startsWith('file:') ? `file:${path.resolve(databaseUrl.slice(5)).replaceAll('\\', '/')}` : databaseUrl },
});
