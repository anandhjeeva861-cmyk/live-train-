-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CatalogImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL
);
INSERT INTO "new_CatalogImport" ("fingerprint", "id") SELECT "fingerprint", "id" FROM "CatalogImport";
DROP TABLE "CatalogImport";
ALTER TABLE "new_CatalogImport" RENAME TO "CatalogImport";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
