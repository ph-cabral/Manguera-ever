import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const items = await prisma.usuario.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true,
      dni: true,
      nombre: true,
      rol: true,
      sector: true,
      vendedorCodigo: true,
      bulonesAccesoTotal: true,
      vickiVentasAcceso: true,
      vickiRrhhAcceso: true,
      activo: true,
      ultimoAcceso: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}
