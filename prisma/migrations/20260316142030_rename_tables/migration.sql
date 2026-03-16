-- CreateTable
CREATE TABLE "fabrica"."personal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabrica"."manguera" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "metros" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manguera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabrica"."corte" (
    "id" SERIAL NOT NULL,
    "metros" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "personalId" INTEGER NOT NULL,
    "mangueraId" INTEGER NOT NULL,

    CONSTRAINT "corte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_dni_key" ON "fabrica"."personal"("dni");

-- CreateIndex
CREATE INDEX "manguera_codigo_idx" ON "fabrica"."manguera"("codigo");

-- CreateIndex
CREATE INDEX "corte_fecha_idx" ON "fabrica"."corte"("fecha");

-- CreateIndex
CREATE INDEX "corte_personalId_idx" ON "fabrica"."corte"("personalId");

-- CreateIndex
CREATE INDEX "corte_mangueraId_idx" ON "fabrica"."corte"("mangueraId");

-- AddForeignKey
ALTER TABLE "fabrica"."corte" ADD CONSTRAINT "corte_personalId_fkey" FOREIGN KEY ("personalId") REFERENCES "fabrica"."personal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabrica"."corte" ADD CONSTRAINT "corte_mangueraId_fkey" FOREIGN KEY ("mangueraId") REFERENCES "fabrica"."manguera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
