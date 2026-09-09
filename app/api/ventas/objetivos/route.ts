// Objetivos de venta por VENDEDOR, LÍNEA y MES (2026-09-09).
//
// Los consume la pestaña "Pulso" de /ventas/bulones: al lado de lo vendido
// por cada vendedor en el período elegido va cuánto tenía que vender y el
// porcentaje de cumplimiento.
//
//   GET    ?linea=BULONERIA[&desde=YYYY-MM][&hasta=YYYY-MM]
//          -> { linea, objetivos: { [vendedor]: { [mes]: pesos } }, puedeEditar }
//          UNA sola lectura trae todos los vendedores del rango: la pantalla
//          arma el ranking entero sin pegarle una vez por fila. `puedeEditar`
//          viaja en la misma respuesta para saber si mostrar el botón.
//
//   POST   { linea, vendedor, meses: [{ mes, objetivoMiles }] }
//          -> upsert de cada mes; un mes con el valor VACÍO se borra. Los
//             valores entran en MILES y se guardan en PESOS (x1.000), como
//             los objetivos de /deposito: la pantalla no escribe los ceros.
//             Va todo en una transacción: o queda el rango entero o no queda
//             nada (si no, un objetivo "de 6 meses" puede quedar a medias).
//
//   DELETE ?linea&vendedor&mes=YYYY-MM            -> borra ese mes
//          ?linea&vendedor&desde=…&hasta=…        -> borra el rango
//
// Escrituras: ADMIN (ver lib/ventas/objetivoAcceso.ts). La lectura la protege
// el módulo "ventas" del middleware, igual que el resto de /api/ventas/*.
//
// La tabla tiene una fila por línea, vendedor y mes (unos cientos por año):
// toda lectura es un index scan por (linea, mes) y no crece con el volumen de
// facturación.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { resolverAccesoObjetivoVentas } from "@/lib/ventas/objetivoAcceso";

export const dynamic = "force-dynamic";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIL = 1_000;
// Techo defensivo: 1.000.000 de miles = $1.000 millones de objetivo en UN mes
// para UN vendedor. Por encima de eso es un dedazo (se escribió el número en
// pesos en vez de en miles).
const MAX_MILES = 1_000_000;
// Un objetivo se carga por un puñado de meses; 36 es un año y medio largo y
// alcanza de sobra. El tope existe para que un POST no arme una transacción
// de tamaño arbitrario.
const MAX_MESES = 36;

const normLinea = (v: unknown) => String(v ?? "").trim().toUpperCase().slice(0, 30);

/** Miles -> pesos. `null` = el campo vino vacío (ese mes se borra). */
function aPesos(v: unknown, mes: string): { ok: true; valor: number | null } | { ok: false; error: string } {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const miles = Number(String(v).replace(",", "."));
  if (!Number.isFinite(miles) || miles <= 0)
    return { ok: false, error: `El objetivo de ${mes} tiene que ser un número mayor a 0 (en miles)` };
  if (miles > MAX_MILES)
    return { ok: false, error: `El objetivo de ${mes} es demasiado alto (máximo ${MAX_MILES} miles)` };
  return { ok: true, valor: Math.round(miles * MIL) };
}

export async function GET(req: NextRequest) {
  const acceso = await resolverAccesoObjetivoVentas();
  if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const sp = req.nextUrl.searchParams;
  const linea = normLinea(sp.get("linea"));
  const desde = sp.get("desde")?.trim() || "";
  const hasta = sp.get("hasta")?.trim() || "";

  if (!linea) return NextResponse.json({ error: "Falta 'linea'" }, { status: 400 });
  for (const [nombre, v] of [["desde", desde], ["hasta", hasta]] as const) {
    if (v && !YM.test(v))
      return NextResponse.json({ error: `'${nombre}' inválido: se espera YYYY-MM` }, { status: 400 });
  }

  try {
    const filas = await prisma.ventas_objetivo.findMany({
      where: {
        linea,
        ...(desde || hasta
          ? { mes: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
          : {}),
      },
      select: { vendedor: true, mes: true, objetivo: true },
      orderBy: [{ vendedor: "asc" }, { mes: "asc" }],
    });

    // Mapa vendedor -> mes -> pesos: la fila del ranking lo consulta por su
    // código, sin recorrer la lista. `objetivo` es BIGINT en la base y BigInt
    // no serializa a JSON, así que se pasa a número acá (el techo de arriba
    // lo mantiene muy por debajo del entero seguro de JS).
    const objetivos: Record<string, Record<string, number>> = {};
    for (const f of filas) {
      const v = String(f.vendedor);
      (objetivos[v] ??= {})[f.mes.trim()] = Number(f.objetivo);
    }
    return NextResponse.json({ linea, objetivos, puedeEditar: acceso.puedeEditar });
  } catch (error) {
    console.error("GET /api/ventas/objetivos", error);
    return NextResponse.json({ error: "No se pudieron leer los objetivos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const acceso = await resolverAccesoObjetivoVentas();
  if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  if (!acceso.puedeEditar)
    return NextResponse.json({ error: "No tenés permiso para cargar objetivos de venta" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const linea = normLinea(body?.linea);
  const vendedor = Number(body?.vendedor);
  const meses = Array.isArray(body?.meses) ? body.meses : null;

  if (!linea) return NextResponse.json({ error: "Falta 'linea'" }, { status: 400 });
  if (!Number.isInteger(vendedor) || vendedor <= 0)
    return NextResponse.json({ error: "Falta el vendedor" }, { status: 400 });
  if (!meses || meses.length === 0)
    return NextResponse.json({ error: "No hay meses para guardar" }, { status: 400 });
  if (meses.length > MAX_MESES)
    return NextResponse.json({ error: `Demasiados meses (máximo ${MAX_MESES})` }, { status: 400 });

  // Se valida TODO antes de escribir: si un mes está mal, no se guarda
  // ninguno y el usuario corrige con el rango completo a la vista.
  const aGuardar: { mes: string; objetivo: number }[] = [];
  const aBorrar: string[] = [];
  const vistos = new Set<string>();
  for (const m of meses as { mes?: unknown; objetivoMiles?: unknown }[]) {
    const mes = String(m?.mes ?? "").trim();
    if (!YM.test(mes))
      return NextResponse.json({ error: `Mes inválido: ${mes || "(vacío)"}` }, { status: 400 });
    if (vistos.has(mes))
      return NextResponse.json({ error: `El mes ${mes} viene repetido` }, { status: 400 });
    vistos.add(mes);
    const v = aPesos(m?.objetivoMiles, mes);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    if (v.valor === null) aBorrar.push(mes);
    else aGuardar.push({ mes, objetivo: v.valor });
  }

  const s = await getSession();

  try {
    // Mismo vendedor + misma línea + mismo mes = corrección, no un objetivo
    // nuevo (lo garantiza la UNIQUE de la tabla). Un solo round-trip para el
    // rango entero.
    await prisma.$transaction([
      ...(aBorrar.length
        ? [prisma.ventas_objetivo.deleteMany({ where: { linea, vendedor, mes: { in: aBorrar } } })]
        : []),
      ...aGuardar.map((g) =>
        prisma.ventas_objetivo.upsert({
          where: { linea_vendedor_mes: { linea, vendedor, mes: g.mes } },
          create: {
            linea,
            vendedor,
            mes: g.mes,
            objetivo: BigInt(g.objetivo),
            creadoPor: s?.uid ?? null,
          },
          update: { objetivo: BigInt(g.objetivo) },
        }),
      ),
    ]);

    // Se devuelve el estado final del vendedor para que la pantalla no
    // recargue todo el mapa después de guardar.
    const objetivos: Record<string, number> = {};
    for (const g of aGuardar) objetivos[g.mes] = g.objetivo;
    return NextResponse.json({
      ok: true,
      linea,
      vendedor,
      objetivos,
      borrados: aBorrar,
    });
  } catch (error) {
    console.error("POST /api/ventas/objetivos", error);
    return NextResponse.json({ error: "No se pudieron guardar los objetivos" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const acceso = await resolverAccesoObjetivoVentas();
  if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  if (!acceso.puedeEditar)
    return NextResponse.json({ error: "No tenés permiso para borrar objetivos de venta" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const linea = normLinea(sp.get("linea"));
  const vendedor = Number(sp.get("vendedor"));
  const mes = sp.get("mes")?.trim() || "";
  const desde = sp.get("desde")?.trim() || "";
  const hasta = sp.get("hasta")?.trim() || "";

  if (!linea) return NextResponse.json({ error: "Falta 'linea'" }, { status: 400 });
  if (!Number.isInteger(vendedor) || vendedor <= 0)
    return NextResponse.json({ error: "Falta el vendedor" }, { status: 400 });
  if (!mes && !(desde && hasta))
    return NextResponse.json({ error: "Falta 'mes' o el rango 'desde'/'hasta'" }, { status: 400 });
  for (const [nombre, v] of [["mes", mes], ["desde", desde], ["hasta", hasta]] as const) {
    if (v && !YM.test(v))
      return NextResponse.json({ error: `'${nombre}' inválido: se espera YYYY-MM` }, { status: 400 });
  }

  try {
    const { count } = await prisma.ventas_objetivo.deleteMany({
      where: {
        linea,
        vendedor,
        ...(mes ? { mes } : { mes: { gte: desde, lte: hasta } }),
      },
    });
    return NextResponse.json({ ok: true, borrados: count });
  } catch (error) {
    console.error("DELETE /api/ventas/objetivos", error);
    return NextResponse.json({ error: "No se pudieron borrar los objetivos" }, { status: 500 });
  }
}
