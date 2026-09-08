import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

// Sucesión de vendedores (2026-09-08, ver sql/vendedor_antecesor.sql).
//
// Desde esta fecha /ventas/vendedor, /ventas/bulones y /ventas/faltantes
// cortan por `Ven_CompCabecera.vendedor` — el mismo eje del pivot
// Ventas_Debitos_Creditos. Esta tabla dice qué OTROS códigos suma cada
// vendedor: los de la gente que se fue o cambió de área y cuya cartera quedó
// a su cargo.
//
// Es código→código y no usuario→usuario porque el antecesor normalmente ya
// no tiene usuario en la app: existe sólo como código en el maestro
// Vendedores de Magnus.
//
// INVARIANTE: un código lo hereda UNO SOLO (unique en `antecesorCodigo`). Es
// lo que garantiza que ningún peso se cuente dos veces y que la suma de
// todas las vistas de vendedor dé el total exacto de la empresa. El 409 de
// abajo es esa restricción hablando.

// El cache de indicadores-api tiene TTL de 5 minutos; esto lo tira abajo
// para que el cambio se vea al toque. Es best-effort a propósito: si la API
// no responde, el alta ya quedó guardada y el TTL la levanta igual.
async function invalidarCache() {
  try {
    await fetch(`${API_URL}/ventas/vendedor/antecesores/invalidar`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* el TTL se encarga */
  }
}

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const items = await prisma.vendedor_antecesor.findMany({
    orderBy: [{ sucesorCodigo: "asc" }, { antecesorCodigo: "asc" }],
    select: {
      id: true,
      sucesorCodigo: true,
      antecesorCodigo: true,
      nota: true,
    },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => ({}));
  const sucesor = Number(body?.sucesorCodigo);
  const antecesor = Number(body?.antecesorCodigo);
  const nota = body?.nota == null ? null : String(body.nota).slice(0, 300);

  if (!Number.isInteger(sucesor) || !Number.isInteger(antecesor)) {
    return NextResponse.json({ error: "Códigos inválidos" }, { status: 400 });
  }
  if (sucesor === antecesor) {
    return NextResponse.json(
      { error: "Un vendedor no puede ser su propio antecesor" },
      { status: 400 },
    );
  }

  // Ciclo: si el sucesor ya figura como antecesor de alguien de la cadena del
  // antecesor, heredar de vuelta armaría un bucle y `codigos_de` se comería
  // los dos lados. La cadena es corta (una mudanza de cartera por vez), así
  // que se recorre entera acá y no en SQL.
  const todos = await prisma.vendedor_antecesor.findMany({
    select: { sucesorCodigo: true, antecesorCodigo: true },
  });
  const antecesoresDe = new Map<number, number[]>();
  for (const r of todos) {
    const l = antecesoresDe.get(r.sucesorCodigo) ?? [];
    l.push(r.antecesorCodigo);
    antecesoresDe.set(r.sucesorCodigo, l);
  }
  const vistos = new Set<number>([antecesor]);
  const cola = [antecesor];
  while (cola.length) {
    for (const a of antecesoresDe.get(cola.pop()!) ?? []) {
      if (!vistos.has(a)) {
        vistos.add(a);
        cola.push(a);
      }
    }
  }
  if (vistos.has(sucesor)) {
    return NextResponse.json(
      { error: "Eso arma un círculo: el antecesor ya hereda de este vendedor" },
      { status: 409 },
    );
  }

  try {
    const item = await prisma.vendedor_antecesor.create({
      data: { sucesorCodigo: sucesor, antecesorCodigo: antecesor, nota },
      select: { id: true, sucesorCodigo: true, antecesorCodigo: true, nota: true },
    });
    await invalidarCache();
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Ese código ya lo hereda otro vendedor. Sacáselo primero: si lo heredaran dos, su venta se contaría dos veces.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await prisma.vendedor_antecesor.delete({ where: { id } });
    await invalidarCache();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
  }
}
