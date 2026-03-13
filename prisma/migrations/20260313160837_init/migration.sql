-- CreateTable
CREATE TABLE "Personal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Manguera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "metros" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Corte" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "metros" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "personalId" INTEGER NOT NULL,
    "mangueraId" INTEGER NOT NULL,
    CONSTRAINT "Corte_personalId_fkey" FOREIGN KEY ("personalId") REFERENCES "Personal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Corte_mangueraId_fkey" FOREIGN KEY ("mangueraId") REFERENCES "Manguera" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Personal_dni_key" ON "Personal"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Manguera_codigo_key" ON "Manguera"("codigo");

-- CreateIndex
CREATE INDEX "Manguera_codigo_idx" ON "Manguera"("codigo");

-- CreateIndex
CREATE INDEX "Corte_fecha_idx" ON "Corte"("fecha");

-- CreateIndex
CREATE INDEX "Corte_personalId_idx" ON "Corte"("personalId");

-- CreateIndex
CREATE INDEX "Corte_mangueraId_idx" ON "Corte"("mangueraId");
