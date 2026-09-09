import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: tiempos de picking del WMS (picking-horas).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = new URLSearchParams();
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  if (desde) qs.set("desde", desde);
  if (hasta) qs.set("hasta", hasta);

  try {
    const res = await fetch(`${API_URL}/deposito/picking-horas?${qs.toString()}`, {
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
    console.error("GET /api/deposito/picking-horas", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
