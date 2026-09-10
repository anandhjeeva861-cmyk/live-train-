-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OtpVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mobileNumber" TEXT NOT NULL,
    "otpHash" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'demo',
    "providerVerificationId" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OtpVerification" ("attempts", "createdAt", "expiresAt", "id", "mobileNumber", "otpHash", "verified") SELECT "attempts", "createdAt", "expiresAt", "id", "mobileNumber", "otpHash", "verified" FROM "OtpVerification";
DROP TABLE "OtpVerification";
ALTER TABLE "new_OtpVerification" RENAME TO "OtpVerification";
CREATE UNIQUE INDEX "OtpVerification_mobileNumber_key" ON "OtpVerification"("mobileNumber");
CREATE INDEX "OtpVerification_expiresAt_idx" ON "OtpVerification"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
