import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Proxy → FastAPI indicadores-api: consumo mensual de los artículos que
// matchean código (q) y/o línea (linea) en un rango de MESES (YYYY-MM) +
// stock por depósito. Para el botón "Tabla" de /compras/consumo (2026-08-11) — mismo patrón que consumo-articulo (singular).
//
// q y linea se combinan por AND cuando vienen los dos, pero NINGUNO es
// obligatorio por separado — hace falta AL MENOS UNO (
// 2026-08-12): sin filtro esto agregaría TODO el catálogo, el mismo
// escenario que ya tiró abajo el proceso una vez (ver NOTA rendimiento en
// fetch_consumo_articulos, indicadores-api/compras.py). Se corta acá mismo,
// antes de pegarle al backend, además del mismo chequeo que ya hace
// fetch_consumo_articulos.
//
// Timeout más alto que el del singular (2026-08-12): esta consulta agrega en
// SQL las ventas de TODOS los artículos que matchean el filtro — más pesada
// que un solo artículo aunque el SUM ya se hace en SQL Server.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "Faltan 'desde'/'hasta'" },
      { status: 400 },
    );
  }
  const q = sp.get("q")?.trim() || null;
  const linea = sp.get("linea")?.trim() || null;
  if (!q && !linea) {
    return NextResponse.json(
      { error: "Ingresá código o línea para buscar" },
      { status: 400 },
    );
  }
  // Orden/página/búsqueda — pasan directo al backend, que ordena y pagina en
  // el servidor (evita traer/serializar el catálogo completo, ver route.ts
  // anterior a 2026-08-12 y NOTA en fetch_consumo_articulos).
  const sort = sp.get("sort") ?? "totalVendido";
  const sortDir = sp.get("sortDir") ?? "desc";
  const page = sp.get("page") ?? "1";
  const pageSize = sp.get("pageSize") ?? "20";
  const qs = new URLSearchParams({ desde, hasta, sort, sortDir, page, pageSize });
  if (q) qs.set("q", q);
  if (linea) qs.set("linea", linea);
  // lineaExacta=1: la línea se compara por igualdad, no como substring. Lo
  // manda el drill-down de la vista, donde el nombre sale de una fila real
  // (2026-09-07) — sin esto, entrar a una línea cuyo nombre es
  // prefijo de otra arrastraría los artículos de las dos.
  if (sp.get("lineaExacta") === "1") qs.set("lineaExacta", "1");
  // fresh=1: lo manda el botón "Refrescar". El backend cachea el cálculo por
  // (rango, filtro) para que ordenar y paginar no vuelvan a consultar; esto es
  // la forma de pedir datos nuevos a propósito.
  if (sp.get("fresh") === "1") qs.set("fresh", "1");
  try {
    const res = await fetch(
      `${API_URL}/compras/consumo-articulos?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(85000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de consumo de artículos", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/compras/consumo-articulos", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
