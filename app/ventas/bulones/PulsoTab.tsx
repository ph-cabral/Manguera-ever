"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ListChevronsUpDown,
  Loader2,
  RefreshCw,
  Target,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { abrirPicker } from "@/components/ui/abrirPicker";
import {
  aMiles,
  mesesEntre,
  objetivoDelRango,
  useObjetivosVentas,
  type ObjetivosLinea,
} from "@/lib/ventas/objetivos";

// ──────────────────────────────────────────────────────────────────────────────
// Pestaña "Pulso" de /ventas/bulones (2026-09-09).
//
// Es el ranking de VENTAS que hasta ahora vivía al pie de /ventas/presupuestos
// (se movió entero: allá ya no está). Lo que lo distingue de la vista normal de
// /ventas/bulones:
//
//   · PERÍODO ELEGIBLE. La vista normal muestra dos columnas fijas (acumulado
//     Ene→mes anterior y mes en curso). Acá se elige el mes — o un rango — y el
//     ranking se recalcula contra ese período. Con `desde`/`hasta` explícitos
//     el back devuelve UNA sola ventana (ver el guard `_mes_cuenta` en
//     bulones.py), así que se lee la columna del acumulado y nada más.
//   · OBJETIVO por vendedor. Ver más abajo.
//
// Los tres ejes (Vendedor / Patrón / Cliente) pegan a los MISMOS endpoints que
// la vista normal (/api/ventas/bulones/top-*): es venta facturada, con el
// mismo criterio de venta neta.
//
// OBJETIVO — sólo en el eje VENDEDOR y en $ (el objetivo comercial se fija en
// pesos, no en unidades). Se guarda un valor POR MES (ver
// lib/ventas/objetivos.ts): el objetivo del período es la suma de los meses del
// rango, así cargar "6 meses" y después corregir uno solo es la misma
// operación. La columna aparece únicamente si hay algo cargado.
// ──────────────────────────────────────────────────────────────────────────────

/** Línea de venta de esta pestaña. Cuando se sumen otras, esto pasa a ser un selector. */
const LINEA = "BULONERIA";

type TopVista = "vendedores" | "patrones" | "clientes";
type Modo = "pesos" | "unidades";

interface TopItem {
  clave: string;
  codigo: number | null;
  etiqueta: string;
  unidades: number;
  monto: number;
}

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const fmtNum = (n: number | null | undefined, dec = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtMoney = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** 'YYYY-MM' + n meses. Lo usan las flechas ‹ › del selector. */
const mesMas = (ym: string, n: number) => {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const nombreMes = (ym: string) => {
  const m = Number(ym.slice(5, 7)) - 1;
  return `${MESES_ES[m] ?? ym} ${ym.slice(0, 4)}`;
};

export default function PulsoTab() {
  const [desde, setDesde] = useState(mesActual);
  const [hasta, setHasta] = useState(mesActual);
  const [rangoAbierto, setRangoAbierto] = useState(false);

  const [vista, setVista] = useState<TopVista>("vendedores");
  const [metrica, setMetrica] = useState<Modo>("pesos");
  const [items, setItems] = useState<TopItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  // Clientes sólo tiene $ en el back (igual que en la vista normal), así que
  // la métrica se fuerza y el toggle queda deshabilitado.
  const modo: Modo = vista === "clientes" ? "pesos" : metrica;

  const meses = useMemo(() => mesesEntre(desde, hasta), [desde, hasta]);
  const obj = useObjetivosVentas(LINEA);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const ruta =
        vista === "vendedores" ? "top-vendedores" : vista === "patrones" ? "top-patrones" : "top-clientes";
      const res = await fetch(`/api/ventas/bulones/${ruta}?desde=${desde}&hasta=${hasta}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo traer el ranking de ventas");
      const crudo = (modo === "pesos" ? json.porMonto : json.porUnidades) ?? [];
      // Las tres respuestas traen forma distinta; se normalizan a una sola
      // fila para que la tabla sea una sola.
      setItems(
        crudo.map((i: Record<string, unknown>) => {
          const cod = i.codigo ?? i.numero;
          return {
            clave: String(i.codigo ?? i.patron ?? i.numero ?? ""),
            codigo: typeof cod === "number" ? cod : null,
            etiqueta:
              (i.nombre as string | null) ??
              (i.detalle as string | null) ??
              String(i.patron ?? i.numero ?? i.codigo ?? "(sin nombre)"),
            unidades: Number(i.unidades ?? 0),
            monto: Number(i.monto ?? 0),
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, vista, modo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const valorDe = (i: TopItem) => (modo === "pesos" ? i.monto : i.unidades);
  // Sólo los valores POSITIVOS entran en el líder y en el total: el ranking de
  // vendedores puede traer a alguien en cero o en negativo por una nota de
  // crédito (ver fetch_top_vendedores en bulones.py), y sumarlo achicaría el
  // denominador de la participación.
  const positivos = items.map(valorDe).filter((v) => v > 0);
  const maxValor = positivos.length ? Math.max(...positivos) : 0;
  const total = positivos.reduce((acc, v) => acc + v, 0);

  // La columna de objetivo sólo tiene sentido por vendedor y en $. Y sólo se
  // muestra si hay algo cargado para el período: si no, es una columna de
  // guiones.
  const conObjetivo =
    vista === "vendedores" &&
    modo === "pesos" &&
    items.some((i) => i.codigo != null && objetivoDelRango(obj.objetivos, i.codigo, meses) != null);

  const periodoLabel = desde === hasta ? nombreMes(desde) : `${nombreMes(desde)} → ${nombreMes(hasta)}`;

  return (
    <section className="space-y-4">
      {/* Controles de período */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-md border border-zinc-700 overflow-hidden">
          <button
            type="button"
            title="Mes anterior"
            onClick={() => {
              setDesde(mesMas(desde, -1));
              setHasta(mesMas(rangoAbierto ? hasta : desde, -1));
            }}
            className="px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            ‹
          </button>
          <input
            type="month"
            onClick={abrirPicker}
            value={desde}
            onChange={(e) => {
              const v = e.target.value || mesActual();
              setDesde(v);
              if (!rangoAbierto) setHasta(v);
            }}
            className="bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none [color-scheme:dark] cursor-pointer"
          />
          {rangoAbierto && (
            <>
              <span className="text-zinc-500 px-1">→</span>
              <input
                type="month"
                onClick={abrirPicker}
                value={hasta}
                onChange={(e) => setHasta(e.target.value || desde)}
                className="bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none [color-scheme:dark] cursor-pointer"
              />
            </>
          )}
          <button
            type="button"
            title="Mes siguiente"
            onClick={() => {
              setDesde(mesMas(desde, 1));
              setHasta(mesMas(rangoAbierto ? hasta : desde, 1));
            }}
            className="px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const siguiente = !rangoAbierto;
            setRangoAbierto(siguiente);
            if (!siguiente) setHasta(desde);
          }}
          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
            rangoAbierto
              ? "border-yellow-400 text-yellow-400"
              : "border-zinc-700 text-zinc-300 hover:border-yellow-400"
          }`}
        >
          {rangoAbierto ? "Un mes" : "Rango"}
        </button>

        <button
          type="button"
          onClick={() => {
            setDesde(mesActual());
            setHasta(mesActual());
          }}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-yellow-400 transition-colors"
        >
          Mes actual
        </button>

        <button
          type="button"
          onClick={() => void cargar()}
          title="Volver a consultar (el back cachea 15 minutos)"
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-yellow-400 transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw size={14} className={cargando ? "animate-spin text-yellow-400" : "text-yellow-400"} />
          Actualizar
        </button>

        {obj.puedeEditar && (
          <button
            type="button"
            onClick={() => setModal(true)}
            title="Cargar el objetivo de venta de un vendedor para uno o varios meses"
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors inline-flex items-center gap-2"
          >
            <Target size={14} />
            Objetivos
          </button>
        )}

        {cargando && (
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 size={14} className="animate-spin text-yellow-400" /> Consultando…
          </span>
        )}
      </div>

      {/* Título + ejes + métrica */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-yellow-400 font-bold uppercase tracking-wide text-sm md:text-base flex items-center gap-2">
          <Trophy size={18} />
          Ventas de bulonería · {periodoLabel}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-sm divide-x divide-zinc-700">
            {(["vendedores", "patrones", "clientes"] as TopVista[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`px-3 py-2 font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  vista === v ? "bg-yellow-400 text-black" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {v === "vendedores" ? (
                  <UserRound size={14} />
                ) : v === "patrones" ? (
                  <ListChevronsUpDown size={14} />
                ) : (
                  <Users size={14} />
                )}
                {v === "vendedores" ? "Vendedor" : v === "patrones" ? "Patrón" : "Cliente"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-sm divide-x divide-zinc-700">
            {(["pesos", "unidades"] as Modo[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={vista === "clientes"}
                onClick={() => setMetrica(m)}
                title={
                  vista === "clientes"
                    ? "El ranking de clientes sólo existe en $"
                    : m === "pesos"
                      ? "Ordenar por $ vendidos"
                      : "Ordenar por unidades vendidas"
                }
                className={`px-3 py-2 font-semibold transition-colors ${
                  modo === m ? "bg-yellow-400 text-black" : "text-zinc-300 hover:bg-zinc-800"
                } ${vista === "clientes" ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {m === "pesos" ? "$" : "Unidades"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-[#1A1A1A] px-5 py-3 text-sm text-red-300">
          <AlertTriangle size={16} className="text-red-400" /> {error}
        </div>
      )}

      {!error && (
        <div className={`rounded-xl border border-zinc-800 overflow-hidden ${cargando ? "opacity-50" : ""}`}>
          {!cargando && items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-600">
              Sin ventas de bulonería registradas en el período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#1A1A1A] text-zinc-400">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium w-10 text-[11px]">#</th>
                    <th className="px-3 py-2 text-left font-medium">
                      {vista === "vendedores" ? "VENDEDOR" : vista === "patrones" ? "PATRÓN" : "CLIENTE"}
                    </th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-l border-zinc-800">
                      {modo === "pesos" ? "VENDIDO" : "UNIDADES"}
                    </th>
                    {conObjetivo && (
                      <>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-l border-zinc-800">
                          OBJETIVO
                        </th>
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CUMPL.</th>
                      </>
                    )}
                    <th className={`px-3 py-2 text-left font-medium ${conObjetivo ? "w-[26%]" : "w-[38%]"}`}>
                      PARTICIPACIÓN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, idx) => {
                    const v = valorDe(i);
                    // La barra es proporcional al LÍDER (lectura rápida de
                    // "quién está lejos"); el % es sobre el TOTAL del ranking.
                    // v <= 0 es un caso REAL: una nota de crédito puede dejar
                    // el neto del mes en cero o en negativo. Esa fila se
                    // muestra con su número real, sin barra y con 0% — meterla
                    // en la participación restaría del total y le inflaría el
                    // porcentaje a todos los demás.
                    const anchoBarra = v > 0 && maxValor > 0 ? Math.max((v / maxValor) * 100, 1.5) : 0;
                    const share = v > 0 && total > 0 ? (v / total) * 100 : 0;
                    const objetivo = conObjetivo
                      ? objetivoDelRango(obj.objetivos, i.codigo ?? "", meses)
                      : null;
                    const cumpl = objetivo && objetivo > 0 ? (v / objetivo) * 100 : null;
                    const colorCumpl =
                      cumpl == null
                        ? "text-zinc-600"
                        : cumpl >= 100
                          ? "text-emerald-400"
                          : cumpl >= 80
                            ? "text-yellow-400"
                            : "text-red-400";
                    return (
                      <tr key={`${i.clave}-${idx}`} className="border-t border-zinc-900 hover:bg-zinc-900/50">
                        <td className={`px-2 py-2 font-bold ${idx === 0 ? "text-yellow-400" : "text-zinc-600"}`}>
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-semibold text-zinc-100 truncate max-w-0" title={i.etiqueta}>
                          {i.etiqueta}
                        </td>
                        <td
                          className={
                            "px-3 py-2 text-right whitespace-nowrap border-l border-zinc-900 " +
                            (v < 0 ? "text-red-400" : "text-zinc-100")
                          }
                          title={
                            v < 0
                              ? "Neto negativo en el período: las devoluciones (notas de crédito) superaron a lo facturado en esta métrica."
                              : undefined
                          }
                        >
                          {modo === "pesos" ? fmtMoney(v) : fmtNum(v)}
                        </td>
                        {conObjetivo && (
                          <>
                            <td className="px-3 py-2 text-right whitespace-nowrap border-l border-zinc-900 text-zinc-400">
                              {objetivo == null ? "—" : fmtMoney(objetivo)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${colorCumpl}`}
                              title={
                                objetivo == null
                                  ? "Este vendedor no tiene objetivo cargado en el período"
                                  : `Objetivo del período (${meses.length} ${meses.length === 1 ? "mes" : "meses"})`
                              }
                            >
                              {cumpl == null ? "—" : `${cumpl.toFixed(0)}%`}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-3">
                            <span className="h-2.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                              <span
                                className="block h-full rounded-full bg-yellow-400"
                                style={{ width: `${anchoBarra}%` }}
                              />
                            </span>
                            <span className="w-14 text-right text-xs font-semibold text-zinc-400">
                              {share.toFixed(1)}%
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {conObjetivo && (
                  <tfoot>
                    <tr className="border-t-2 border-zinc-700 bg-zinc-900/60 text-zinc-300">
                      <td className="px-2 py-2" />
                      <td className="px-3 py-2 font-semibold uppercase text-xs tracking-wide">Total</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap border-l border-zinc-900 text-zinc-100 font-semibold">
                        {fmtMoney(total)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap border-l border-zinc-900">
                        {fmtMoney(totalObjetivo(obj.objetivos, items, meses))}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-zinc-100">
                        {(() => {
                          const to = totalObjetivo(obj.objetivos, items, meses);
                          return to > 0 ? `${((total / to) * 100).toFixed(0)}%` : "—";
                        })()}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {conObjetivo && (
        <p className="text-[11px] text-zinc-600">
          El objetivo es la suma de los meses del período ({meses.length}{" "}
          {meses.length === 1 ? "mes" : "meses"}). Los vendedores sin objetivo cargado quedan con “—”.
        </p>
      )}

      {modal && (
        <ObjetivoModal
          vendedores={items
            .filter((i) => i.codigo != null)
            .map((i) => ({ codigo: i.codigo as number, nombre: i.etiqueta }))}
          objetivos={obj.objetivos}
          desdeInicial={desde}
          hastaInicial={hasta}
          onGuardar={obj.guardar}
          onBorrarRango={obj.borrarRango}
          onCerrar={() => setModal(false)}
        />
      )}
    </section>
  );
}

/** Suma de los objetivos del período de los vendedores que están en el ranking. */
function totalObjetivo(objetivos: ObjetivosLinea, items: TopItem[], meses: string[]) {
  let t = 0;
  for (const i of items) {
    if (i.codigo == null) continue;
    t += objetivoDelRango(objetivos, i.codigo, meses) ?? 0;
  }
  return t;
}

// ─── MODAL DE CARGA ───────────────────────────────────────────────────────────
// Un objetivo se piensa "tanto por mes durante N meses", pero se GUARDA mes por
// mes (ver lib/ventas/objetivos.ts). Por eso el formulario tiene las dos
// entradas atadas — el mensual y el total del rango, cualquiera de las dos
// completa la otra — y abajo el detalle mes a mes, que es donde se corrige uno
// solo sin romper el resto.
//
// Todo entra EN MILES: 1.500 = $1.500.000. La API multiplica x1.000 al escribir.
function ObjetivoModal({
  vendedores,
  objetivos,
  desdeInicial,
  hastaInicial,
  onGuardar,
  onBorrarRango,
  onCerrar,
}: {
  vendedores: { codigo: number; nombre: string }[];
  objetivos: ObjetivosLinea;
  desdeInicial: string;
  hastaInicial: string;
  onGuardar: (
    vendedor: number,
    meses: { mes: string; objetivoMiles: string }[],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onBorrarRango: (
    vendedor: number,
    desde: string,
    hasta: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCerrar: () => void;
}) {
  const [vendedor, setVendedor] = useState<number | null>(vendedores[0]?.codigo ?? null);
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial >= desdeInicial ? hastaInicial : desdeInicial);
  const [porMes, setPorMes] = useState("");
  const [totalRango, setTotalRango] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meses = useMemo(() => mesesEntre(desde, hasta), [desde, hasta]);

  // Al abrir, al cambiar de vendedor y al mover el rango: precargar lo que ya
  // esté guardado para esos meses.
  useEffect(() => {
    if (vendedor == null) return;
    const guardados = objetivos[String(vendedor)] ?? {};
    const next: Record<string, string> = {};
    for (const m of meses) next[m] = aMiles(guardados[m]);
    setValores(next);
    setError(null);
    sincronizarCabecera(next, meses, setPorMes, setTotalRango);
  }, [vendedor, meses, objetivos]);

  const cargados = meses.filter((m) => (valores[m] ?? "") !== "").length;

  /** Escribir el mensual pisa TODOS los meses del rango. */
  const cambiarPorMes = (v: string) => {
    setPorMes(v);
    const next: Record<string, string> = {};
    for (const m of meses) next[m] = v;
    setValores(next);
    const n = Number(v.replace(",", "."));
    setTotalRango(v === "" ? "" : Number.isFinite(n) ? String(redondear(n * meses.length)) : "");
  };

  /** Escribir el total lo reparte en partes iguales entre los meses del rango. */
  const cambiarTotal = (v: string) => {
    setTotalRango(v);
    const n = Number(v.replace(",", "."));
    if (v === "" || !Number.isFinite(n) || meses.length === 0) {
      setPorMes("");
      setValores(Object.fromEntries(meses.map((m) => [m, ""])));
      return;
    }
    const mensual = redondear(n / meses.length);
    setPorMes(String(mensual));
    setValores(Object.fromEntries(meses.map((m) => [m, String(mensual)])));
  };

  /** Retocar un mes suelto: se recalcula el total y el mensual deja de ser único. */
  const cambiarMes = (mes: string, v: string) => {
    const next = { ...valores, [mes]: v };
    setValores(next);
    sincronizarCabecera(next, meses, setPorMes, setTotalRango);
  };

  const guardar = async () => {
    if (vendedor == null) return;
    setGuardando(true);
    setError(null);
    const r = await onGuardar(
      vendedor,
      meses.map((m) => ({ mes: m, objetivoMiles: (valores[m] ?? "").replace(",", ".") })),
    );
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  const borrar = async () => {
    if (vendedor == null) return;
    setGuardando(true);
    setError(null);
    const r = await onBorrarRango(vendedor, desde, hasta);
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-[#171717] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-zinc-100">Objetivos de venta · bulonería</h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            Se cargan <strong className="text-zinc-400">en miles</strong>: 1.500 = $ 1.500.000. Se guarda
            un valor por mes, así se puede corregir un mes suelto sin tocar los demás.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium text-zinc-300">Vendedor</span>
            <select
              value={vendedor ?? ""}
              onChange={(e) => setVendedor(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#1f1f1f] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-400 cursor-pointer"
            >
              {vendedores.length === 0 && <option value="">(sin vendedores en el período)</option>}
              {vendedores.map((v) => (
                <option key={v.codigo} value={v.codigo}>
                  {v.nombre}
                  {objetivos[String(v.codigo)] ? " · con objetivo" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-zinc-600">
              La lista sale del ranking del período elegido.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-300">Desde</span>
              <input
                type="month"
                onClick={abrirPicker}
                value={desde}
                onChange={(e) => {
                  const v = e.target.value || desde;
                  setDesde(v);
                  if (hasta < v) setHasta(v);
                }}
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#1f1f1f] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-400 [color-scheme:dark] cursor-pointer"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-300">Hasta</span>
              <input
                type="month"
                onClick={abrirPicker}
                value={hasta}
                onChange={(e) => {
                  const v = e.target.value || hasta;
                  setHasta(v < desde ? desde : v);
                }}
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#1f1f1f] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-400 [color-scheme:dark] cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CampoMiles
              label="Por mes"
              valor={porMes}
              setValor={cambiarPorMes}
              ayuda={`× ${meses.length} ${meses.length === 1 ? "mes" : "meses"}`}
            />
            <CampoMiles
              label="Total del período"
              valor={totalRango}
              setValor={cambiarTotal}
              ayuda="Se reparte en partes iguales"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Detalle por mes (miles)</span>
              <span className="text-[11px] text-zinc-600">
                {cargados} de {meses.length} con valor
              </span>
            </div>
            <div className="mt-1.5 max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {meses.map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-xs text-zinc-400">{nombreMes(m)}</span>
                  <input
                    inputMode="decimal"
                    value={valores[m] ?? ""}
                    placeholder="—"
                    onChange={(e) => cambiarMes(m, e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-[#1f1f1f] px-3 py-1.5 text-right text-sm tabular-nums text-zinc-100 outline-none focus:border-yellow-400"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Un mes vacío se borra al guardar.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-400/40 bg-red-400/5 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3">
          {cargados > 0 ? (
            <button
              type="button"
              onClick={borrar}
              disabled={guardando || vendedor == null}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              Quitar objetivos del período
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || vendedor == null || meses.length === 0}
              className="rounded-lg bg-yellow-400 px-4 py-1.5 text-xs font-semibold text-black hover:bg-yellow-300 transition-colors disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampoMiles({
  label,
  valor,
  setValor,
  ayuda,
}: {
  label: string;
  valor: string;
  setValor: (v: string) => void;
  ayuda: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-300">{label}</span>
      <input
        inputMode="decimal"
        value={valor}
        placeholder="—"
        onChange={(e) => setValor(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#1f1f1f] px-3 py-2 text-right text-sm tabular-nums text-zinc-100 outline-none focus:border-yellow-400"
      />
      <span className="mt-1 block text-[11px] text-zinc-600">{ayuda}</span>
    </label>
  );
}

/** Dos decimales: en miles alcanza para llegar al peso. */
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Vuelve a armar el mensual y el total a partir del detalle: el mensual sólo
 * se muestra si TODOS los meses tienen el mismo valor (si no, quedó retocado a
 * mano y mostrar uno solo mentiría).
 */
function sincronizarCabecera(
  valores: Record<string, string>,
  meses: string[],
  setPorMes: (v: string) => void,
  setTotal: (v: string) => void,
) {
  const vals = meses.map((m) => (valores[m] ?? "").replace(",", "."));
  const nums = vals.map((v) => (v === "" ? null : Number(v)));
  const todosIguales =
    vals.length > 0 && vals.every((v) => v === vals[0]) && vals[0] !== "" && Number.isFinite(Number(vals[0]));
  setPorMes(todosIguales ? vals[0] : "");
  const suma = nums.reduce<number>((acc, n) => acc + (n != null && Number.isFinite(n) ? n : 0), 0);
  setTotal(suma > 0 ? String(redondear(suma)) : "");
}
