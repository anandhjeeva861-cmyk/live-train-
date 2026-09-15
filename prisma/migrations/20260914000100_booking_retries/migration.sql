-- Nullable fields preserve existing bookings while deduplicating checkout retries.
ALTER TABLE "Booking" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "Booking" ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "Booking_userId_requestKey_key" ON "Booking"("userId", "requestKey");
