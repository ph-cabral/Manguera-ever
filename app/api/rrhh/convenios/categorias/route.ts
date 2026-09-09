import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/rrhh/convenios/categorias  { nombre, convenioId }
// Alta rápida desde el botón "+" del selector. Upsert por (nombre, convenioId):
// el mismo nombre puede existir en dos convenios distintos, y de hecho pasa
// (ADMINISTRATIVO A está en MERCANTIL y en FUERA DE CONVENIO).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const nombre = String(body?.nombre ?? "").trim().toUpperCase();
    const convenioId = Number(body?.convenioId);

    if (!nombre) {
      return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    }
    if (!Number.isInteger(convenioId) || convenioId <= 0) {
      return NextResponse.json({ error: "convenioId inválido" }, { status: 400 });
    }

    const categoria = await prisma.convenio_categoria.upsert({
      where: { nombre_convenioId: { nombre, convenioId } },
      update: {},
      create: { nombre, convenioId },
      select: { id: true, nombre: true, convenioId: true },
    });
    return NextResponse.json(categoria);
  } catch (error) {
    console.error("POST /api/rrhh/convenios/categorias", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
