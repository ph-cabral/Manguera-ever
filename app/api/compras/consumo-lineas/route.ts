import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Proxy → FastAPI indicadores-api: consumo mensual agregado por LÍNEA
// (Stk_Nivel1) en un rango de MESES (YYYY-MM) + stock. Alimenta el botón
// "Líneas" de /compras/consumo (2026-09-07) — mismas métricas
// que consumo-articulos, otra unidad de agregación.
//
// Suma SOLO artículos nacionales (recorte en SQL, ver _COND_NACIONAL en
// indicadores-api/compras.py).
//
// SIN filtro obligatorio, a diferencia de consumo-articulos: es la pantalla de
// entrada de la vista y tiene que listar todas las líneas de una. Es barato
// (la agregación por línea/mes no crece con el catálogo, ver el docstring de
// fetch_consumo_lineas).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan 'desde'/'hasta'" }, { status: 400 });
  }
  const q = sp.get("q")?.trim() || null;
  const linea = sp.get("linea")?.trim() || null;
  const sort = sp.get("sort") ?? "totalVendido";
  const sortDir = sp.get("sortDir") ?? "desc";
  const page = sp.get("page") ?? "1";
  const pageSize = sp.get("pageSize") ?? "20";
  const qs = new URLSearchParams({ desde, hasta, sort, sortDir, page, pageSize });
  if (q) qs.set("q", q);
  if (linea) qs.set("linea", linea);
  if (sp.get("lineaExacta") === "1") qs.set("lineaExacta", "1");
  try {
    const res = await fetch(`${API_URL}/compras/consumo-lineas?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(85000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de consumo por línea", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/compras/consumo-lineas", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
