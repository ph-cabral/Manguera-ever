import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Proxy → FastAPI indicadores-api: TODOS los artículos (sin paginar) que
// matchean el filtro de la vista "Tabla" de /compras/consumo, para el botón
// "Exportar Excel" (2026-08-12). A diferencia de
// /api/compras/consumo-articulos (paginado), acá se arma el .xlsx directo
// (lib "xlsx" ya es dependencia del proyecto, mismo patrón que
// /api/deposito/stock/export).
//
// Requiere 'linea': no se puede exportar sin elegir una línea — se corta acá
// mismo (antes de pegarle al backend) además del mismo chequeo que ya hace
// fetch_consumo_articulos(export=True) del lado de indicadores-api.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan 'desde'/'hasta'" }, { status: 400 });
  }
  const linea = sp.get("linea")?.trim() || "";
  if (!linea) {
    return NextResponse.json(
      { error: "Elegí una línea para exportar" },
      { status: 400 },
    );
  }
  const q = sp.get("q")?.trim() || null;
  const sort = sp.get("sort") ?? "totalVendido";
  const sortDir = sp.get("sortDir") ?? "desc";
  const qs = new URLSearchParams({ desde, hasta, sort, sortDir, linea });
  if (q) qs.set("q", q);
  if (sp.get("lineaExacta") === "1") qs.set("lineaExacta", "1");

  try {
    const res = await fetch(
      `${API_URL}/compras/consumo-articulos/export?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(85000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de consumo de artículos", detail },
        { status: res.status },
      );
    }
    const j = await res.json();
    const articulos: Array<Record<string, unknown>> = j?.articulos ?? [];

    const data = articulos.map((r) => ({
      Código: r.codigo,
      Artículo: r.nombre,
      Stock: r.stock,
      Vendido: r.totalVendido,
      Promedio: r.promedio,
      Máximo: r.maximo,
      Mínimo: r.minimo,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consumo");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const fecha = new Date().toISOString().slice(0, 10);
    const lineaSlug = linea.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "linea";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="consumo_${lineaSlug}_${fecha}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("GET /api/compras/consumo-articulos/export", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
