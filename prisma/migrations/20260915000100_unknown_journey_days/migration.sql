-- This marker may already exist in databases imported before this migration.
CREATE TABLE IF NOT EXISTS "CatalogImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrainStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "platform" TEXT,
    "distanceKm" REAL,
    "day" INTEGER DEFAULT 1,
    "isHalt" BOOLEAN,
    CONSTRAINT "TrainStop_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "Train" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainStop_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TrainStop" ("arrivalTime", "day", "departureTime", "distanceKm", "id", "isHalt", "platform", "stationId", "stopOrder", "trainId") SELECT "arrivalTime", "day", "departureTime", "distanceKm", "id", "isHalt", "platform", "stationId", "stopOrder", "trainId" FROM "TrainStop";
DROP TABLE "TrainStop";
ALTER TABLE "new_TrainStop" RENAME TO "TrainStop";
CREATE INDEX "TrainStop_stationId_idx" ON "TrainStop"("stationId");
CREATE UNIQUE INDEX "TrainStop_trainId_stopOrder_key" ON "TrainStop"("trainId", "stopOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
