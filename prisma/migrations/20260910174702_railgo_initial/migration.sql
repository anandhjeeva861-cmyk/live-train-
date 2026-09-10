-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mobileNumber" TEXT NOT NULL,
    "mobileVerified" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "googleId" TEXT,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OtpVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mobileNumber" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Train" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originStationId" TEXT NOT NULL,
    "destinationStationId" TEXT NOT NULL,
    "departureTime" TEXT NOT NULL,
    "arrivalTime" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "rating" REAL NOT NULL DEFAULT 4.5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Train_originStationId_fkey" FOREIGN KEY ("originStationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Train_destinationStationId_fkey" FOREIGN KEY ("destinationStationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,
    "arrivalTime" TEXT NOT NULL,
    "departureTime" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "distanceKm" REAL NOT NULL,
    CONSTRAINT "TrainStop_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainStop_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainId" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "fare" INTEGER NOT NULL,
    "totalSeats" INTEGER NOT NULL,
    "availableSeats" INTEGER NOT NULL,
    CONSTRAINT "TrainClass_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainClassId" TEXT NOT NULL,
    "journeyDate" TEXT NOT NULL,
    "availableSeats" INTEGER NOT NULL,
    CONSTRAINT "JourneyInventory_trainClassId_fkey" FOREIGN KEY ("trainClassId") REFERENCES "TrainClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pnr" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "journeyDate" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,
    "totalFare" INTEGER NOT NULL,
    "bookingStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "coach" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    CONSTRAINT "Passenger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    CONSTRAINT "SeatReservation_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "JourneyInventory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeatReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveTrainStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainId" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "currentSpeed" REAL NOT NULL,
    "averageSpeed" REAL NOT NULL,
    "nextStationId" TEXT,
    "previousStationId" TEXT,
    "distanceRemaining" REAL NOT NULL,
    "progressPercent" REAL NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiveTrainStatus_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveTrainStatus_nextStationId_fkey" FOREIGN KEY ("nextStationId") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LiveTrainStatus_previousStationId_fkey" FOREIGN KEY ("previousStationId") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TouristSpot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "distanceKm" REAL NOT NULL,
    "rating" REAL NOT NULL,
    CONSTRAINT "TouristSpot_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mobileNumber_key" ON "User"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "OtpVerification_mobileNumber_key" ON "OtpVerification"("mobileNumber");

-- CreateIndex
CREATE INDEX "OtpVerification_expiresAt_idx" ON "OtpVerification"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE INDEX "Station_city_idx" ON "Station"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Train_trainNumber_key" ON "Train"("trainNumber");

-- CreateIndex
CREATE INDEX "Train_originStationId_destinationStationId_type_active_idx" ON "Train"("originStationId", "destinationStationId", "type", "active");

-- CreateIndex
CREATE INDEX "TrainStop_stationId_idx" ON "TrainStop"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainStop_trainId_stopOrder_key" ON "TrainStop"("trainId", "stopOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainStop_trainId_stationId_key" ON "TrainStop"("trainId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainClass_trainId_classCode_key" ON "TrainClass"("trainId", "classCode");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyInventory_trainClassId_journeyDate_key" ON "JourneyInventory"("trainClassId", "journeyDate");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_pnr_key" ON "Booking"("pnr");

-- CreateIndex
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_trainId_journeyDate_classCode_bookingStatus_idx" ON "Booking"("trainId", "journeyDate", "classCode", "bookingStatus");

-- CreateIndex
CREATE INDEX "Passenger_bookingId_idx" ON "Passenger"("bookingId");

-- CreateIndex
CREATE INDEX "SeatReservation_bookingId_idx" ON "SeatReservation"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_inventoryId_seatNumber_key" ON "SeatReservation"("inventoryId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LiveTrainStatus_trainId_key" ON "LiveTrainStatus"("trainId");

-- CreateIndex
CREATE INDEX "TouristSpot_stationId_category_idx" ON "TouristSpot"("stationId", "category");
