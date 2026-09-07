import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Proxy → FastAPI indicadores-api: TODAS las líneas (sin paginar) que matchean
// el filtro de la vista "Líneas" de /compras/consumo, para el botón "Exportar
// Excel" (2026-09-07). Mismo patrón que
// /api/compras/consumo-articulos/export: el .xlsx se arma acá.
//
// Requiere 'linea', igual que el export de artículos.
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

  try {
    const res = await fetch(
      `${API_URL}/compras/consumo-lineas/export?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(85000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de consumo por línea", detail },
        { status: res.status },
      );
    }
    const j = await res.json();
    const lineas: Array<Record<string, unknown>> = j?.lineas ?? [];

    const data = lineas.map((r) => ({
      Línea: r.linea,
      Artículos: r.articulos,
      Stock: r.stock,
      Vendido: r.totalVendido,
      Promedio: r.promedio,
      Máximo: r.maximo,
      Mínimo: r.minimo,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consumo por línea");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const fecha = new Date().toISOString().slice(0, 10);
    const lineaSlug = linea.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "linea";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="consumo_lineas_${lineaSlug}_${fecha}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("GET /api/compras/consumo-lineas/export", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
