-- CreateTable
CREATE TABLE "Manguera" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "diametro" TEXT NOT NULL,
    "longitud" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Manguera_codigo_key" ON "Manguera"("codigo");
