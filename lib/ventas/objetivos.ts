"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Objetivos de venta por VENDEDOR y MES de una línea (2026-09-09).
 *
 * Los usa la pestaña "Pulso" de /ventas/bulones. Se guardan en Postgres
 * (everwear.ventas_objetivo) una fila por vendedor, línea y mes, y se cargan
 * EN MILES desde la pantalla: la API multiplica x1.000 al escribir, así que lo
 * que llega acá ya está en PESOS, la misma unidad de la columna "Vendido".
 *
 * Una sola llamada trae TODOS los vendedores y TODOS los meses de la línea (la
 * tabla son unos cientos de filas por año), así que mover el selector de
 * período no vuelve a pegarle al servidor: el objetivo de un rango es una
 * suma en memoria.
 */
export type ObjetivosLinea = Record<string, Record<string, number>>;

export const MIL = 1_000;

/** Pesos -> miles, para poblar el formulario ("" si no hay objetivo). */
export const aMiles = (v: number | null | undefined) =>
  v == null ? "" : String(Math.round((v / MIL) * 100) / 100);

/** Lista de meses 'YYYY-MM' entre dos extremos, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  if (!desde || !hasta || hasta < desde) return desde ? [desde] : [];
  const out: string[] = [];
  let [a, m] = desde.split("-").map(Number);
  for (let i = 0; i < 120; i++) {
    const ym = `${a}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= hasta) break;
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out;
}

export function useObjetivosVentas(linea: string) {
  const [objetivos, setObjetivos] = useState<ObjetivosLinea>({});
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [cargando, setCargando] = useState(false);

  const recargar = useCallback(async () => {
    if (!linea) return;
    setCargando(true);
    try {
      const r = await fetch(`/api/ventas/objetivos?linea=${encodeURIComponent(linea)}`, {
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setObjetivos((j.objetivos ?? {}) as ObjetivosLinea);
        setPuedeEditar(j.puedeEditar === true);
      }
    } catch {
      // Sin objetivos el ranking se muestra igual, sólo sin la columna.
    } finally {
      setCargando(false);
    }
  }, [linea]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /**
   * Guarda el rango completo de un vendedor. Cada mes va EN MILES; un mes con
   * el valor vacío se borra. Es una sola llamada: el back lo resuelve en una
   * transacción para que un objetivo de varios meses no quede a medias.
   */
  const guardar = useCallback(
    async (
      vendedor: number,
      meses: { mes: string; objetivoMiles: string }[],
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const r = await fetch("/api/ventas/objetivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linea, vendedor, meses }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j?.error || `HTTP ${r.status}` };
      setObjetivos((prev) => {
        const clave = String(vendedor);
        const delVendedor = { ...(prev[clave] ?? {}) };
        for (const m of (j.borrados ?? []) as string[]) delete delVendedor[m];
        for (const [m, v] of Object.entries((j.objetivos ?? {}) as Record<string, number>))
          delVendedor[m] = v;
        const next = { ...prev, [clave]: delVendedor };
        if (Object.keys(delVendedor).length === 0) delete next[clave];
        return next;
      });
      return { ok: true };
    },
    [linea],
  );

  /** Borra de un saque todos los objetivos del vendedor en el rango. */
  const borrarRango = useCallback(
    async (
      vendedor: number,
      desde: string,
      hasta: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const qs = new URLSearchParams({
        linea,
        vendedor: String(vendedor),
        desde,
        hasta,
      });
      const r = await fetch(`/api/ventas/objetivos?${qs.toString()}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j?.error || `HTTP ${r.status}` };
      setObjetivos((prev) => {
        const clave = String(vendedor);
        if (!prev[clave]) return prev;
        const delVendedor = { ...prev[clave] };
        for (const m of mesesEntre(desde, hasta)) delete delVendedor[m];
        const next = { ...prev };
        if (Object.keys(delVendedor).length === 0) delete next[clave];
        else next[clave] = delVendedor;
        return next;
      });
      return { ok: true };
    },
    [linea],
  );

  return { objetivos, puedeEditar, cargando, recargar, guardar, borrarRango };
}

/**
 * Objetivo de un vendedor para un rango de meses: la SUMA de los meses que
 * tengan algo cargado. Devuelve `null` si no hay ninguno — así la pantalla
 * distingue "sin objetivo" de "objetivo cero".
 */
export function objetivoDelRango(
  objetivos: ObjetivosLinea,
  vendedor: number | string,
  meses: string[],
): number | null {
  const delVendedor = objetivos[String(vendedor)];
  if (!delVendedor) return null;
  let total = 0;
  let hay = false;
  for (const m of meses) {
    const v = delVendedor[m];
    if (v != null) {
      total += v;
      hay = true;
    }
  }
  return hay ? total : null;
}
