"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";
import { UsuarioActual } from "@/components/auth/UsuarioActual";
import { abrirPicker } from "@/components/ui/abrirPicker";

// ──────────────────────────────────────────────────────────────────────────────
// /ventas/presupuestos — presupuestos de BULONERÍA (Ven_CodCom 45) separados
// por estado (2026-08-31).
//
// Fuente: /api/ventas/presupuestos/bulones (presupuestos.py, tablas
// Pre_PresupCab/Pre_PresupReng). Una tabla POR ESTADO, una debajo de la otra,
// cada una colapsable, más chips arriba para mostrar/ocultar. Se eligió
// apilado en vez de pestañas porque el uso real es comparar "cuánto tengo
// autorizado vs cuánto aprobado" de un vistazo; con pestañas hay que ir y
// volver. Los chips tapan el caso contrario (mirar uno solo).
//
// El default del período es el MES EN CURSO: un presupuesto se mira mientras
// está vivo.
//
// 2026-09-09 — abajo había además el ranking de VENTAS FACTURADAS del período
// (/api/ventas/bulones/top-*). Se movió entero a la pestaña "Pulso" de
// /ventas/bulones (app/ventas/bulones/PulsoTab.tsx), donde además tiene el
// objetivo por vendedor. Esta pantalla quedó con una sola fuente: presupuestos.
// ──────────────────────────────────────────────────────────────────────────────

interface Renglon {
  n: number;
  codigo: string | null;
  detalle: string | null;
  cantidad: number;
  entregada: number;
  pendiente: number;
  precioLista: number;
  bonificacion: number;
  precio: number;
  importe: number;
  importePendiente: number;
}

interface Presupuesto {
  nro: number;
  comprobante: string;
  fecha: string | null;
  validezHasta: string | null;
  validezDias: number;
  estado: number;
  estadoNombre: string;
  motivoCancel: number | null;
  codCliente: number;
  cliente: string | null;
  codVendedor: number;
  vendedor: string | null;
  condicionVenta: string | null;
  formaPago: string | null;
  transporte: string | null;
  listaPrecio: number;
  lugarEntrega: string | null;
  plazoEntrega: string | null;
  neto: number;
  iva: number;
  total: number;
  impreso: boolean;
  unidades: number;
  unidadesPendientes: number;
  pendiente: number;
  renglones: Renglon[];
}

interface ResumenEstado {
  estado: number;
  nombre: string;
  cantidad: number;
  renglones: number;
  neto: number;
  total: number;
  unidades: number;
  pendiente: number;
}

interface RespPresupuestos {
  desde: string;
  hasta: string;
  truncado: boolean;
  resumen: { cantidad: number; renglones: number; neto: number; total: number; unidades: number; pendiente: number };
  porEstado: ResumenEstado[];
  presupuestos: Presupuesto[];
}

type OrdenCampo = "fecha" | "cliente" | "neto" | "pendiente";

// Orden de aparición de las tablas: primero los estados VIVOS (los que hay
// que trabajar), después los cerrados. No es el orden numérico del ERP a
// propósito.
const ORDEN_ESTADOS = [1, 3, 0, 2];

const COLOR_ESTADO: Record<number, { chip: string; borde: string; texto: string }> = {
  0: { chip: "bg-zinc-700 text-zinc-100", borde: "border-zinc-600", texto: "text-zinc-300" },
  1: { chip: "bg-yellow-400 text-black", borde: "border-yellow-400/50", texto: "text-yellow-400" },
  2: { chip: "bg-red-500 text-white", borde: "border-red-500/40", texto: "text-red-400" },
  3: { chip: "bg-emerald-500 text-black", borde: "border-emerald-500/40", texto: "text-emerald-400" },
};

const fmtNum = (n: number | null | undefined, dec = 0) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** 'YYYY-MM' + n meses. Se usa para las flechas ‹ › del selector. */
const mesMas = (ym: string, n: number) => {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function VentasPresupuestosPage() {
  // Rango. `unMes` = el caso normal (mes en curso y las flechas mueven los
  // dos extremos juntos); si el usuario abre "rango", desde y hasta se
  // manejan por separado.
  const [desde, setDesde] = useState(mesActual);
  const [hasta, setHasta] = useState(mesActual);
  const [rangoAbierto, setRangoAbierto] = useState(false);

  const [data, setData] = useState<RespPresupuestos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ocultos, setOcultos] = useState<Set<number>>(new Set());
  const [colapsados, setColapsados] = useState<Set<number>>(new Set());
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [orden, setOrden] = useState<{ campo: OrdenCampo; desc: boolean }>({ campo: "fecha", desc: true });

  const cargarPresupuestos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/ventas/presupuestos/bulones?desde=${desde}&hasta=${hasta}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudieron traer los presupuestos");
      setData(json as RespPresupuestos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargarPresupuestos();
  }, [cargarPresupuestos]);

  const alternar = (set: Set<number>, valor: number, setter: (s: Set<number>) => void) => {
    const copia = new Set(set);
    if (copia.has(valor)) copia.delete(valor);
    else copia.add(valor);
    setter(copia);
  };

  const ordenar = (lista: Presupuesto[]) => {
    const signo = orden.desc ? -1 : 1;
    return [...lista].sort((a, b) => {
      switch (orden.campo) {
        case "cliente":
          return signo * (a.cliente ?? "").localeCompare(b.cliente ?? "", "es");
        case "neto":
          return signo * (a.neto - b.neto);
        case "pendiente":
          return signo * (a.pendiente - b.pendiente);
        default:
          return signo * ((a.fecha ?? "").localeCompare(b.fecha ?? "") || a.nro - b.nro);
      }
    });
  };

  const porEstado = useMemo(() => {
    const mapa = new Map<number, Presupuesto[]>();
    for (const cod of ORDEN_ESTADOS) mapa.set(cod, []);
    for (const p of data?.presupuestos ?? []) {
      if (!mapa.has(p.estado)) mapa.set(p.estado, []);
      mapa.get(p.estado)!.push(p);
    }
    return mapa;
  }, [data]);

  const resumenDe = (cod: number) =>
    data?.porEstado.find((e) => e.estado === cod) ??
    { estado: cod, nombre: `Estado ${cod}`, cantidad: 0, renglones: 0, neto: 0, total: 0, unidades: 0, pendiente: 0 };

  const cabecerasOrden: { campo: OrdenCampo; label: string; align: string }[] = [
    { campo: "fecha", label: "Fecha", align: "text-left" },
    { campo: "cliente", label: "Cliente", align: "text-left" },
    { campo: "neto", label: "Neto", align: "text-right" },
    { campo: "pendiente", label: "Pendiente", align: "text-right" },
  ];

  return (
    <div className="min-h-screen bg-[#111] text-zinc-100">
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 px-4 md:px-8 py-3">
        <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 md:flex md:flex-wrap md:gap-4">
          <div className="flex items-center gap-3 min-w-0 md:order-1">
            <InicioButton />
            <span className="font-bold text-yellow-400 text-base md:text-2xl tracking-wide uppercase whitespace-nowrap">
              EVER WEAR <span className="text-xs md:text-sm tracking-[3px] font-normal">S.A.</span>
            </span>
          </div>
          <h2 className="justify-self-end text-yellow-400 font-bold text-sm md:text-lg uppercase tracking-wide flex items-center gap-2 whitespace-nowrap md:order-2">
            <FileText size={18} />
            bulonería · presupuestos
          </h2>
          <UsuarioActual className="col-span-2 justify-self-end md:order-3 md:ml-auto" />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Controles de período. Manda en las dos mitades de la página. */}
        <section className="flex flex-wrap items-center gap-3">
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
            onClick={() => void cargarPresupuestos()}
            title="Volver a consultar (el back cachea 5 minutos)"
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-yellow-400 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw size={14} className={cargando ? "animate-spin text-yellow-400" : "text-yellow-400"} />
            Actualizar
          </button>

          {cargando && (
            <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 size={14} className="animate-spin text-yellow-400" /> Consultando…
            </span>
          )}
        </section>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-[#1A1A1A] px-5 py-3 text-sm text-red-300">
            <AlertTriangle size={16} className="text-red-400" /> {error}
          </div>
        )}

        {data?.truncado && (
          <div className="flex items-center gap-3 rounded-xl border border-yellow-400/40 bg-[#1A1A1A] px-5 py-3 text-sm text-yellow-200">
            <AlertTriangle size={16} className="text-yellow-400" />
            El rango devolvió más renglones de los que se traen de una vez: la lista está cortada. Acotá el período.
          </div>
        )}

        {/* Totales del período + chips por estado (click = mostrar/ocultar esa
            tabla). Los chips son el filtro; las tablas van apiladas. */}
        <section className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Presupuestos", valor: fmtNum(data?.resumen.cantidad ?? 0) },
            { label: "Neto presupuestado", valor: fmtMoney(data?.resumen.neto ?? 0) },
            { label: "Pendiente de pedir", valor: fmtMoney(data?.resumen.pendiente ?? 0) },
            { label: "Unidades", valor: fmtNum(data?.resumen.unidades ?? 0) },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-zinc-800 bg-[#1A1A1A] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{k.label}</p>
              <p className="text-lg md:text-xl font-bold text-zinc-100">{k.valor}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap gap-2">
          {ORDEN_ESTADOS.map((cod) => {
            const r = resumenDe(cod);
            const oculto = ocultos.has(cod);
            const color = COLOR_ESTADO[cod] ?? COLOR_ESTADO[0];
            return (
              <button
                key={cod}
                type="button"
                onClick={() => alternar(ocultos, cod, setOcultos)}
                title={oculto ? "Mostrar esta tabla" : "Ocultar esta tabla"}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  oculto ? "bg-zinc-900 text-zinc-500 border border-zinc-800" : color.chip
                }`}
              >
                {r.nombre} · {r.cantidad}
              </button>
            );
          })}
        </section>

        {/* Una tabla por estado, apiladas. El encabezado de cada una es el
            botón que la colapsa. */}
        {ORDEN_ESTADOS.filter((cod) => !ocultos.has(cod)).map((cod) => {
          const r = resumenDe(cod);
          const color = COLOR_ESTADO[cod] ?? COLOR_ESTADO[0];
          const filas = ordenar(porEstado.get(cod) ?? []);
          const colapsada = colapsados.has(cod);
          return (
            <section key={cod} className={`rounded-xl border ${color.borde} overflow-hidden`}>
              <button
                type="button"
                onClick={() => alternar(colapsados, cod, setColapsados)}
                className="w-full flex flex-wrap items-center justify-between gap-3 bg-[#1A1A1A] px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
              >
                <span className="flex items-center gap-2 font-bold uppercase tracking-wide text-sm">
                  {colapsada ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <span className={color.texto}>{r.nombre}</span>
                  <span className="text-zinc-500 font-normal normal-case">
                    {r.cantidad} presupuesto{r.cantidad === 1 ? "" : "s"} · {r.renglones} renglones
                  </span>
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className="text-zinc-400">
                    Neto <span className="text-zinc-100 font-semibold">{fmtMoney(r.neto)}</span>
                  </span>
                  <span className="text-zinc-400">
                    Pendiente <span className="text-zinc-100 font-semibold">{fmtMoney(r.pendiente)}</span>
                  </span>
                </span>
              </button>

              {!colapsada &&
                (filas.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-zinc-600">
                    Sin presupuestos en este estado para el período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#151515] text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Comprobante</th>
                          {cabecerasOrden.map((c) => (
                            <th
                              key={c.campo}
                              className={`px-3 py-2 font-medium whitespace-nowrap ${c.align} cursor-pointer select-none hover:text-yellow-400`}
                              onClick={() =>
                                setOrden((o) =>
                                  o.campo === c.campo ? { campo: c.campo, desc: !o.desc } : { campo: c.campo, desc: true },
                                )
                              }
                              title="Ordenar por esta columna (aplica a todas las tablas)"
                            >
                              {c.label}
                              {orden.campo === c.campo && (orden.desc ? " ↓" : " ↑")}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Vendedor</th>
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Transporte</th>
                          <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Unid.</th>
                          <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((p) => {
                          const abierto = abiertos.has(p.nro);
                          return (
                            <Fragment key={p.nro}>
                              {/* Una fila = un presupuesto. Click en cualquier
                                  parte abre los renglones (fila hermana con
                                  colSpan, así las columnas siguen alineadas
                                  con el thead — no meter un grid adentro de
                                  un td, se desalinea). */}
                              <tr
                                onClick={() => alternar(abiertos, p.nro, setAbiertos)}
                                title="Ver los renglones"
                                className="border-t border-zinc-900 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                              >
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-yellow-400">
                                  <span className="inline-flex items-center gap-1">
                                    {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    {p.comprobante}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{fmtFecha(p.fecha)}</td>
                                <td className="px-3 py-2 text-zinc-100 max-w-[260px] truncate" title={p.cliente ?? ""}>
                                  {p.cliente ?? `(cliente ${p.codCliente})`}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-zinc-100">
                                  {fmtMoney(p.neto)}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right whitespace-nowrap ${
                                    p.pendiente > 0 ? "text-yellow-400" : "text-zinc-600"
                                  }`}
                                >
                                  {fmtMoney(p.pendiente)}
                                </td>
                                <td className="px-3 py-2 text-zinc-300 max-w-[200px] truncate" title={p.vendedor ?? ""}>
                                  {p.vendedor ?? `(cód. ${p.codVendedor})`}
                                </td>
                                <td className="px-3 py-2 text-zinc-400 max-w-[180px] truncate" title={p.transporte ?? ""}>
                                  {p.transporte ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-zinc-300">
                                  {fmtNum(p.unidades)}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-zinc-300">
                                  {fmtMoney(p.total)}
                                </td>
                              </tr>

                              {abierto && (
                                <tr className="bg-[#141414]">
                                  <td colSpan={9} className="px-4 py-3 border-t border-zinc-900">
                                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400 mb-3">
                                      <span>
                                        Nº interno <span className="text-zinc-200">{p.nro}</span>
                                      </span>
                                      <span>
                                        Cond. venta <span className="text-zinc-200">{p.condicionVenta ?? "—"}</span>
                                      </span>
                                      <span>
                                        Forma de pago <span className="text-zinc-200">{p.formaPago ?? "—"}</span>
                                      </span>
                                      <span>
                                        Lista <span className="text-zinc-200">{p.listaPrecio}</span>
                                      </span>
                                      <span>
                                        Validez{" "}
                                        <span className="text-zinc-200">
                                          {p.validezDias} días (hasta {fmtFecha(p.validezHasta)})
                                        </span>
                                      </span>
                                      <span>
                                        Entrega <span className="text-zinc-200">{p.plazoEntrega ?? "—"}</span>
                                      </span>
                                      <span>
                                        Impreso <span className="text-zinc-200">{p.impreso ? "sí" : "no"}</span>
                                      </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs">
                                        <thead className="text-zinc-500">
                                          <tr>
                                            <th className="px-2 py-1 text-left font-medium">#</th>
                                            <th className="px-2 py-1 text-left font-medium">Artículo</th>
                                            <th className="px-2 py-1 text-left font-medium">Detalle</th>
                                            <th className="px-2 py-1 text-right font-medium">Presup.</th>
                                            <th className="px-2 py-1 text-right font-medium">Entregada</th>
                                            <th className="px-2 py-1 text-right font-medium">Pendiente</th>
                                            <th className="px-2 py-1 text-right font-medium">P. lista</th>
                                            <th className="px-2 py-1 text-right font-medium">% Bon.</th>
                                            <th className="px-2 py-1 text-right font-medium">P. bonif.</th>
                                            <th className="px-2 py-1 text-right font-medium">Importe</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {p.renglones.map((r2) => (
                                            <tr key={r2.n} className="border-t border-zinc-900">
                                              <td className="px-2 py-1 text-zinc-500">{r2.n}</td>
                                              <td className="px-2 py-1 font-mono text-zinc-300">{r2.codigo ?? "—"}</td>
                                              <td className="px-2 py-1 text-zinc-400">{r2.detalle ?? "—"}</td>
                                              <td className="px-2 py-1 text-right text-zinc-200">{fmtNum(r2.cantidad)}</td>
                                              <td className="px-2 py-1 text-right text-zinc-400">{fmtNum(r2.entregada)}</td>
                                              <td
                                                className={`px-2 py-1 text-right ${
                                                  r2.pendiente > 0 ? "text-yellow-400" : "text-zinc-600"
                                                }`}
                                              >
                                                {fmtNum(r2.pendiente)}
                                              </td>
                                              <td className="px-2 py-1 text-right text-zinc-500">
                                                {fmtMoney(r2.precioLista)}
                                              </td>
                                              <td className="px-2 py-1 text-right text-zinc-500">
                                                {fmtNum(r2.bonificacion, 2)}
                                              </td>
                                              <td className="px-2 py-1 text-right text-zinc-300">{fmtMoney(r2.precio)}</td>
                                              <td className="px-2 py-1 text-right font-semibold text-zinc-100">
                                                {fmtMoney(r2.importe)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
            </section>
          );
        })}
      </main>
    </div>
  );
}
