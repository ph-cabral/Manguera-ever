-- CreateTable
CREATE TABLE "Personal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Personal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manguera" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "diametro" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manguera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corte" (
    "id" SERIAL NOT NULL,
    "metros" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "personalId" INTEGER NOT NULL,
    "mangueraId" INTEGER NOT NULL,

    CONSTRAINT "Corte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Personal_dni_key" ON "Personal"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Manguera_codigo_key" ON "Manguera"("codigo");

-- CreateIndex
CREATE INDEX "Manguera_codigo_idx" ON "Manguera"("codigo");

-- CreateIndex
CREATE INDEX "Manguera_tipo_idx" ON "Manguera"("tipo");

-- CreateIndex
CREATE INDEX "Corte_fecha_idx" ON "Corte"("fecha");

-- CreateIndex
CREATE INDEX "Corte_personalId_idx" ON "Corte"("personalId");

-- CreateIndex
CREATE INDEX "Corte_mangueraId_idx" ON "Corte"("mangueraId");

-- AddForeignKey
ALTER TABLE "Corte" ADD CONSTRAINT "Corte_personalId_fkey" FOREIGN KEY ("personalId") REFERENCES "Personal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Corte" ADD CONSTRAINT "Corte_mangueraId_fkey" FOREIGN KEY ("mangueraId") REFERENCES "Manguera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
