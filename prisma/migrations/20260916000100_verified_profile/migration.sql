-- Additive profile fields preserve existing users, sessions and bookings.
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TEXT;
ALTER TABLE "User" ADD COLUMN "contactMobile" TEXT;
ALTER TABLE "EmailVerification" ADD COLUMN "firstName" TEXT;
ALTER TABLE "EmailVerification" ADD COLUMN "dateOfBirth" TEXT;
ALTER TABLE "EmailVerification" ADD COLUMN "contactMobile" TEXT;
