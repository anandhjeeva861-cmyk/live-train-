ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "EmailVerification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumed" BOOLEAN NOT NULL DEFAULT false,
  "delivered" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "EmailVerification_email_key" ON "EmailVerification"("email");
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");
