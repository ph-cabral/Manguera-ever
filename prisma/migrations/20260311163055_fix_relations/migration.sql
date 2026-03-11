/*
  Warnings:

  - Added the required column `updatedAt` to the `Manguera` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Manguera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "metros" INTEGER NOT NULL,
    "ubicacion" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Manguera_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Manguera" ("codigo", "createdAt", "id", "metros", "ubicacion", "usuarioId") SELECT "codigo", "createdAt", "id", "metros", "ubicacion", "usuarioId" FROM "Manguera";
DROP TABLE "Manguera";
ALTER TABLE "new_Manguera" RENAME TO "Manguera";
CREATE UNIQUE INDEX "Manguera_codigo_key" ON "Manguera"("codigo");
CREATE INDEX "Manguera_codigo_idx" ON "Manguera"("codigo");
CREATE INDEX "Manguera_usuarioId_idx" ON "Manguera"("usuarioId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
