import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/rrhh/convenios — catálogo completo, con las categorías anidadas.
// Va anidado a propósito: son pocas filas y el selector del legajo filtra en
// memoria, así cambiar de convenio no dispara una consulta por cada cambio.
export async function GET() {
  const convenios = await prisma.convenio.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      categorias: {
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true },
      },
    },
  });
  return NextResponse.json(convenios);
}

// POST /api/rrhh/convenios  { nombre }
// Alta rápida desde el botón "+" del selector. Upsert por nombre para no duplicar.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const nombre = String(body?.nombre ?? "").trim().toUpperCase();
    if (!nombre) {
      return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    }

    const convenio = await prisma.convenio.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
      select: { id: true, nombre: true },
    });
    return NextResponse.json(convenio);
  } catch (error) {
    console.error("POST /api/rrhh/convenios", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
