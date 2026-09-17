import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/cloud/schema.prisma',
  migrations: { path: 'prisma/cloud/migrations' },
  datasource: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || 'postgresql://localhost/railgo' },
});
