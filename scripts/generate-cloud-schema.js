import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Keep one model definition while giving PostgreSQL its own migrations/client.
const source = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const schema = source.replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "../../generated/cloud-client"')
  .replace('provider = "sqlite"', 'provider = "postgresql"');
const limits = '\nmodel RateLimit {\n  id String @id\n  hits Int\n  expiresAt DateTime\n  @@index([expiresAt])\n}\n';
const directory = new URL('../prisma/cloud/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('schema.prisma', directory), schema + limits);
