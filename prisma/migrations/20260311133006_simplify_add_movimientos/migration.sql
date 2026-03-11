/*
  Warnings:

  - You are about to drop the column `diametro` on the `Manguera` table. All the data in the column will be lost.
  - You are about to drop the column `longitud` on the `Manguera` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `Manguera` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `Manguera` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Movimiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mangueraId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "metros" INTEGER NOT NULL,
    "stockPrevio" INTEGER NOT NULL,
    "stockNuevo" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Movimiento_mangueraId_fkey" FOREIGN KEY ("mangueraId") REFERENCES "Manguera" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Manguera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Manguera" ("codigo", "createdAt", "id", "stock", "ubicacion", "updatedAt") SELECT "codigo", "createdAt", "id", "stock", "ubicacion", "updatedAt" FROM "Manguera";
DROP TABLE "Manguera";
ALTER TABLE "new_Manguera" RENAME TO "Manguera";
CREATE UNIQUE INDEX "Manguera_codigo_key" ON "Manguera"("codigo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
