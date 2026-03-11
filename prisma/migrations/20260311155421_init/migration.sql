/*
  Warnings:

  - You are about to drop the `Movimiento` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `stock` on the `Manguera` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Manguera` table. All the data in the column will be lost.
  - Added the required column `metros` to the `Manguera` table without a default value. This is not possible if the table is not empty.
  - Added the required column `usuarioId` to the `Manguera` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Movimiento";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    CONSTRAINT "Manguera_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Manguera" ("codigo", "createdAt", "id", "ubicacion") SELECT "codigo", "createdAt", "id", "ubicacion" FROM "Manguera";
DROP TABLE "Manguera";
ALTER TABLE "new_Manguera" RENAME TO "Manguera";
CREATE INDEX "Manguera_codigo_idx" ON "Manguera"("codigo");
CREATE INDEX "Manguera_usuarioId_idx" ON "Manguera"("usuarioId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
