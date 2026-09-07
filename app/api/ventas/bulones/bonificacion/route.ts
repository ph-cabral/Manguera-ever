import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy -> FastAPI indicadores-api (/ventas/bulones/bonificacion).
//
// A diferencia de los otros proxies de /ventas/bulones, este NO reenvía
// `vendedor` al back aunque el usuario sea no-admin: la bonificación son notas
// de crédito por CONCEPTO, sin artículo y por lo tanto sin línea, y el número
// es de TODA la empresa. Acotarlo a una cartera daría un prorrateo calculado
// sobre una venta parcial, que no significa nada. Ver bonificaciones.py.
//
// SOLO ADMIN (2026-09-07): la tarjeta de bonificación es el
// número de toda la empresa (más el prorrateo a bulonería), información de
// dirección. Se corta por `rol === "ADMIN"` de la sesión, no por
// resolverAccesoBulones(): la bandera `bulonesAccesoTotal` abre los DATOS de
// bulonería a un no-admin, no este indicador. Cualquier otro usuario recibe el
// payload en cero y el front no dibuja la tarjeta (`bonificacionEmpresa !== 0`),
// así que el importe nunca sale del server.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde")?.trim() || undefined;
  const hasta = sp.get("hasta")?.trim() || undefined;

  // Sesión de la cookie: sin consulta a Postgres. Un no-admin sale por el
  // vacío de abajo antes de tocar la base o el indicadores-api.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.rol !== "ADMIN") {
    return NextResponse.json({
      desde: desde ?? null,
      hasta: hasta ?? null,
      bonificacionEmpresa: 0,
      ventaTotal: 0,
      ventaBulones: 0,
      participacion: 0,
      montoBulones: 0,
      porConcepto: [],
      porMes: [],
    });
  }

  try {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(
      `${API_URL}/ventas/bulones/bonificacion?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(55000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const motivo = typeof detail?.detail === "string" ? detail.detail : null;
      return NextResponse.json(
        {
          error: motivo
            ? `Error en API de bonificación: ${motivo}`
            : "Error en API de bonificación",
          detail,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/ventas/bulones/bonificacion", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
