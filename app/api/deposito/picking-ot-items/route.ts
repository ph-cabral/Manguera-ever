import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: renglones de UNA OT (se piden al abrir la
// fila en el tab de tiempos, no vienen con las cabeceras).
export async function GET(req: NextRequest) {
  const ot = new URL(req.url).searchParams.get("ot");
  if (!ot) {
    return NextResponse.json({ error: "Falta el parámetro ot" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/deposito/picking-ot-items?ot=${encodeURIComponent(ot)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de depósito (picking)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/picking-ot-items", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
