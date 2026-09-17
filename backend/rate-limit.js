import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { prisma, cloudDatabase } from './db.js';

// PostgreSQL enforces one shared limit across Vercel function instances.
export class DatabaseRateLimitStore {
  localKeys = false;
  nextCleanup = 0;
  constructor(prefix) { this.prefix = prefix; }
  init(options) { this.windowMs = options.windowMs; }
  id(key) { return crypto.createHash('sha256').update(this.prefix + ':' + key).digest('hex'); }
  async increment(key) {
    const now = new Date(), reset = new Date(+now + this.windowMs), id = this.id(key);
    const [row] = await prisma.$queryRaw`
      INSERT INTO "RateLimit" ("id", "hits", "expiresAt") VALUES (${id}, 1, ${reset})
      ON CONFLICT ("id") DO UPDATE SET
        "hits" = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN 1 ELSE "RateLimit"."hits" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN ${reset} ELSE "RateLimit"."expiresAt" END
      RETURNING "hits", "expiresAt"`;
    if (+now >= this.nextCleanup) {
      this.nextCleanup = +now + 15 * 60000;
      await prisma.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
    }
    return { totalHits: row.hits, resetTime: new Date(row.expiresAt) };
  }
  async decrement(key) { await prisma.rateLimit.updateMany({ where: { id: this.id(key), hits: { gt: 0 } }, data: { hits: { decrement: 1 } } }); }
  async resetKey(key) { await prisma.rateLimit.deleteMany({ where: { id: this.id(key) } }); }
}

export const createLimiter = (prefix, options) => rateLimit({ ...options, ...(cloudDatabase && { store: new DatabaseRateLimitStore(prefix) }) });
