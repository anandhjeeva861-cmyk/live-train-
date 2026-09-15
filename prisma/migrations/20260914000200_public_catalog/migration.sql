-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "state" TEXT,
    "coordinateSource" TEXT
);
INSERT INTO "new_Station" ("city", "code", "id", "latitude", "longitude", "name") SELECT "city", "code", "id", "latitude", "longitude", "name" FROM "Station";
DROP TABLE "Station";
ALTER TABLE "new_Station" RENAME TO "Station";
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");
CREATE INDEX "Station_city_idx" ON "Station"("city");
CREATE TABLE "new_TouristSpot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "distanceKm" REAL,
    "rating" REAL,
    "sourceUrl" TEXT,
    "photoPage" TEXT,
    "photoAuthor" TEXT,
    "photoLicense" TEXT,
    "photoLicenseUrl" TEXT,
    CONSTRAINT "TouristSpot_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TouristSpot" ("category", "description", "distanceKm", "id", "imageUrl", "latitude", "longitude", "name", "rating", "stationId") SELECT "category", "description", "distanceKm", "id", "imageUrl", "latitude", "longitude", "name", "rating", "stationId" FROM "TouristSpot";
DROP TABLE "TouristSpot";
ALTER TABLE "new_TouristSpot" RENAME TO "TouristSpot";
CREATE INDEX "TouristSpot_stationId_category_idx" ON "TouristSpot"("stationId", "category");
CREATE TABLE "new_Train" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originStationId" TEXT NOT NULL,
    "destinationStationId" TEXT NOT NULL,
    "departureTime" TEXT,
    "arrivalTime" TEXT,
    "duration" TEXT,
    "rating" REAL,
    "sourceId" TEXT,
    "sourceDate" TEXT,
    "historical" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "runningDays" TEXT,
    "distanceKm" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Train_originStationId_fkey" FOREIGN KEY ("originStationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Train_destinationStationId_fkey" FOREIGN KEY ("destinationStationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Train" ("active", "arrivalTime", "departureTime", "destinationStationId", "duration", "id", "name", "originStationId", "rating", "trainNumber", "type") SELECT "active", "arrivalTime", "departureTime", "destinationStationId", "duration", "id", "name", "originStationId", "rating", "trainNumber", "type" FROM "Train";
DROP TABLE "Train";
ALTER TABLE "new_Train" RENAME TO "Train";
CREATE UNIQUE INDEX "Train_trainNumber_key" ON "Train"("trainNumber");
CREATE INDEX "Train_originStationId_destinationStationId_type_active_idx" ON "Train"("originStationId", "destinationStationId", "type", "active");
CREATE TABLE "new_TrainStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "platform" TEXT,
    "distanceKm" REAL,
    "day" INTEGER NOT NULL DEFAULT 1,
    "isHalt" BOOLEAN,
    CONSTRAINT "TrainStop_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainStop_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TrainStop" ("arrivalTime", "departureTime", "distanceKm", "id", "platform", "stationId", "stopOrder", "trainId") SELECT "arrivalTime", "departureTime", "distanceKm", "id", "platform", "stationId", "stopOrder", "trainId" FROM "TrainStop";
DROP TABLE "TrainStop";
ALTER TABLE "new_TrainStop" RENAME TO "TrainStop";
CREATE INDEX "TrainStop_stationId_idx" ON "TrainStop"("stationId");
CREATE UNIQUE INDEX "TrainStop_trainId_stopOrder_key" ON "TrainStop"("trainId", "stopOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
