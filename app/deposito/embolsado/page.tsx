"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Loader2, AlertTriangle, RefreshCw, Play, Check, X, Clock,
} from "lucide-react";
import { PageTitle, Panel, fmtNum } from "../components/ui";
import { InicioButton } from "@/components/ui/InicioButton";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

// ──────────────────────────────────────────────────────────────────────────────
// Sistema de embolsado — qué fraccionar primero y registro de quién lo hizo.
//
// La lista sale de /api/deposito/embolsado (recomendación en vivo contra Magnus
// + WMS, ver indicadores-api/embolsado.py) y viene YA ORDENADA por menor
// cobertura; a igual cobertura, primero el que más rota. Acá no se reordena: lo
// único que hace la vista es partirla en las tres solapas y llevar el ciclo
// tomar → cerrar.
//
//   Para embolsar → falta stock Y hay material en el pulmón de ingreso.
//   Sin material  → falta stock pero el pulmón está vacío: no se puede trabajar.
//   Cubiertos     → ya llegan al objetivo de meses; están para poder mirarlos.
//
// Pensada para usarse de pie, en una tablet: fila alta, botón grande, y el
// cierre con Enter sobre el input de cantidad sin tocar ningún otro botón.
// ──────────────────────────────────────────────────────────────────────────────

type Fila = {
  codArticulo: string;
  nombre: string;
  empaque: string;
  unidadesPorBolsa: number | null;
  ventaMaxMes: number;
  stockSinIngreso: number;
  enIngreso: number;
  coberturaMeses: number;
  objetivo: number;
  faltante: number;
  aEmbolsar: number;
  bolsas: number | null;
  topeadoPorIngreso: boolean;
  cubierto: boolean;
};

type Registro = {
  id: number;
  codArticulo: string;
  nombre: string;
  empaque: string;
  embolsador: string;
  inicio: string;
  fin: string | null;
  cantidad: number | null;
  recomendado: number | null;
};

type Solapa = "trabajar" | "sinMaterial" | "cubiertos";

const SOLAPAS: { key: Solapa; label: string }[] = [
  { key: "trabajar", label: "Para embolsar" },
  { key: "sinMaterial", label: "Sin material" },
  { key: "cubiertos", label: "Cubiertos" },
];

// El nombre del embolsador se escribe una vez por tablet y queda: es la misma
// persona toda la jornada. Sólo una comodidad — el nombre real viaja igual en
// cada POST, esto no es sesión ni permiso.
const LS_NOMBRE = "embolsado:nombre";

const MESES_COBERTURA = 4;

/** Color del semáforo de cobertura contra el objetivo de meses. */
function colorCobertura(m: number) {
  if (m < 1) return "text-red-400";
  if (m < 2) return "text-orange-400";
  if (m < MESES_COBERTURA) return "text-yellow-400";
  return "text-emerald-400";
}

/** "2h 14m" desde un ISO hasta ahora. */
function transcurrido(desdeIso: string, ahora: number) {
  const min = Math.max(0, Math.round((ahora - new Date(desdeIso).getTime()) / 60000));
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export default function DepositoEmbolsadoPage() {
  const [rows, setRows] = useState<Fila[]>([]);
  const [enCurso, setEnCurso] = useState<Registro[]>([]);
  const [hechosHoy, setHechosHoy] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [solapa, setSolapa] = useState<Solapa>("trabajar");
  const [q, setQ] = useState("");
  const [nombre, setNombre] = useState("");
  const [abriendo, setAbriendo] = useState<string | null>(null); // cod que pide nombre
  const [guardando, setGuardando] = useState<string | number | null>(null);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [ahora, setAhora] = useState(() => Date.now());

  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setNombre(localStorage.getItem(LS_NOMBRE) ?? "");
    } catch {
      // navegador con storage bloqueado: se escribe el nombre a mano y listo.
    }
  }, []);

  // Reloj de los cronómetros de "en curso". Un minuto alcanza: el dato que se
  // muestra está en minutos.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deposito/embolsado", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.rows ?? []);
      setEnCurso(j.enCurso ?? []);
      setHechosHoy(j.hechosHoy ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, tick]);

  const abiertoPorCod = useMemo(() => {
    const m = new Map<string, Registro>();
    for (const r of enCurso) m.set(r.codArticulo.trim(), r);
    return m;
  }, [enCurso]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return rows.filter((r) => {
      const enSolapa =
        solapa === "cubiertos"
          ? r.cubierto
          : solapa === "sinMaterial"
            ? !r.cubierto && r.enIngreso <= 0
            : !r.cubierto && r.enIngreso > 0;
      if (!enSolapa) return false;
      if (!texto) return true;
      return (
        r.codArticulo.toLowerCase().includes(texto) ||
        r.nombre.toLowerCase().includes(texto)
      );
    });
  }, [rows, solapa, q]);

  const conteos = useMemo(
    () => ({
      trabajar: rows.filter((r) => !r.cubierto && r.enIngreso > 0).length,
      sinMaterial: rows.filter((r) => !r.cubierto && r.enIngreso <= 0).length,
      cubiertos: rows.filter((r) => r.cubierto).length,
    }),
    [rows],
  );

  const unidadesHoy = useMemo(
    () => hechosHoy.reduce((a, r) => a + (r.cantidad ?? 0), 0),
    [hechosHoy],
  );

  async function tomar(fila: Fila) {
    const quien = nombre.trim();
    if (quien.length < 2) {
      setAbriendo(fila.codArticulo);
      setError("Escribí tu nombre antes de tomar un ítem");
      setTimeout(() => nombreRef.current?.focus(), 0);
      return;
    }
    setGuardando(fila.codArticulo);
    setError(null);
    setAviso(null);
    try {
      try {
        localStorage.setItem(LS_NOMBRE, quien);
      } catch {
        // sin storage el nombre se pierde al recargar, nada más
      }
      const res = await fetch("/api/deposito/embolsado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codArticulo: fila.codArticulo,
          embolsador: quien,
          nombre: fila.nombre,
          empaque: fila.empaque,
          recomendado: Math.round(fila.aEmbolsar),
          ventaMaxMes: Math.round(fila.ventaMaxMes),
          stockSinIngreso: Math.round(fila.stockSinIngreso),
          enIngreso: Math.round(fila.enIngreso),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setEnCurso((prev) => [...prev, j as Registro]);
      setAbriendo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo tomar el ítem");
      setTick((t) => t + 1); // se lo llevó otro: refrescar para verlo
    } finally {
      setGuardando(null);
    }
  }

  async function cerrar(reg: Registro) {
    const crudo = (cantidades[reg.id] ?? "").trim();
    const cantidad = Number(crudo);
    if (!crudo || !Number.isFinite(cantidad) || cantidad < 0) {
      setError("Cargá la cantidad embolsada");
      return;
    }
    setGuardando(reg.id);
    setError(null);
    try {
      const res = await fetch("/api/deposito/embolsado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reg.id, cantidad: Math.round(cantidad) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setEnCurso((prev) => prev.filter((r) => r.id !== reg.id));
      setHechosHoy((prev) => [j as Registro, ...prev]);
      setCantidades((prev) => {
        const next = { ...prev };
        delete next[reg.id];
        return next;
      });
      setAviso(`${reg.codArticulo}: ${fmtNum(Math.round(cantidad))} u embolsadas`);
      // El stock cambió: la recomendación se recalcula sola en el próximo GET.
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el ítem");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <InicioButton label="Inicio" iconSize={14} className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors" />
          <UsuarioActual />
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <PageTitle
            title="Embolsado"
            sub={`Qué fraccionar primero · cobertura = stock embolsado ÷ venta máxima mensual (6 meses) · objetivo ${MESES_COBERTURA} meses`}
          />
          <div className="flex items-center gap-2 mt-1">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar código o nombre…"
                className="bg-[#1f1f1f] border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-zinc-100 focus:border-yellow-400 outline-none w-60"
              />
            </div>
            <button
              onClick={() => setTick((t) => t + 1)}
              title="Refrescar"
              disabled={loading}
              className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Nombre del embolsador: uno solo, escrito a mano, para toda la jornada. */}
        <div className="flex items-center gap-3 flex-wrap mb-4 bg-[#1a1a1a] border border-zinc-800 rounded-xl px-4 py-3">
          <span className="text-sm text-zinc-400">Embolsador</span>
          <input
            ref={nombreRef}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            className="bg-[#111111] border border-zinc-700 rounded-lg px-3 py-2 text-base text-zinc-100 focus:border-yellow-400 outline-none w-56"
          />
          <span className="text-xs text-zinc-600">
            Un ítem por persona a la vez. Al terminar, cargá la cantidad y Enter.
          </span>
          <span className="ml-auto text-sm text-zinc-400">
            Hoy: <b className="text-yellow-400">{hechosHoy.length}</b> ítems ·{" "}
            <b className="text-yellow-400">{fmtNum(unidadesHoy)}</b> u
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-300 text-sm mb-3">
            <AlertTriangle size={14} /> {error}
            <button onClick={() => setError(null)} className="text-zinc-500 hover:text-zinc-300">
              <X size={13} />
            </button>
          </div>
        )}
        {aviso && (
          <div className="flex items-center gap-2 text-emerald-300 text-sm mb-3">
            <Check size={14} /> {aviso}
          </div>
        )}

        <div className="flex items-center gap-1 mb-3">
          {SOLAPAS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSolapa(s.key)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                solapa === s.key
                  ? "border-yellow-400 text-yellow-400"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {s.label}{" "}
              <span className="text-xs text-zinc-600">({conteos[s.key]})</span>
            </button>
          ))}
        </div>

        <Panel bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Artículo</th>
                  <th className="text-right font-medium px-3 py-2">Cobertura</th>
                  <th className="text-right font-medium px-3 py-2">Venta máx./mes</th>
                  <th className="text-right font-medium px-3 py-2">Embolsado</th>
                  <th className="text-right font-medium px-3 py-2">En ingreso</th>
                  <th className="text-right font-medium px-3 py-2">A embolsar</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => {
                  const abierto = abiertoPorCod.get(r.codArticulo);
                  const pidiendoNombre = abriendo === r.codArticulo && !abierto;
                  return (
                    <tr
                      key={r.codArticulo}
                      className={`border-b border-zinc-900 align-middle ${
                        abierto ? "bg-yellow-400/5" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="font-mono text-zinc-300">{r.codArticulo}</div>
                        <div className="text-zinc-400 text-[13px]">
                          {r.nombre}
                          {r.empaque && (
                            <span className="text-zinc-500"> · {r.empaque}</span>
                          )}
                        </div>
                        {abierto && (
                          <div className="flex items-center gap-1.5 text-[12px] text-yellow-400 mt-1">
                            <Clock size={12} />
                            {abierto.embolsador} · desde {hora(abierto.inicio)} (
                            {transcurrido(abierto.inicio, ahora)})
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums ${colorCobertura(r.coberturaMeses)}`}>
                        {fmtNum(r.coberturaMeses, 1)} m
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-400">
                        {fmtNum(r.ventaMaxMes)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-400">
                        {fmtNum(r.stockSinIngreso)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-400">
                        {fmtNum(r.enIngreso)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="text-zinc-100 font-medium">{fmtNum(r.aEmbolsar)}</div>
                        <div className="text-[11px] text-zinc-500">
                          {r.bolsas != null && r.bolsas > 0 && `${fmtNum(r.bolsas)} bolsas`}
                          {r.topeadoPorIngreso && (
                            <span className="text-orange-400">
                              {r.bolsas != null && r.bolsas > 0 ? " · " : ""}tope ingreso
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {abierto ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              autoFocus
                              inputMode="numeric"
                              value={cantidades[abierto.id] ?? ""}
                              onChange={(e) =>
                                setCantidades((p) => ({
                                  ...p,
                                  [abierto.id]: e.target.value.replace(/[^\d]/g, ""),
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") cerrar(abierto);
                              }}
                              placeholder="Cantidad"
                              className="bg-[#111111] border border-yellow-400/60 rounded-lg px-3 py-2 text-base text-zinc-100 outline-none w-28 text-right"
                            />
                            <button
                              onClick={() => cerrar(abierto)}
                              disabled={guardando === abierto.id}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-400 text-black font-medium disabled:opacity-40"
                            >
                              {guardando === abierto.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Check size={14} />
                              )}
                              Listo
                            </button>
                          </div>
                        ) : r.enIngreso <= 0 ? (
                          <span className="text-xs text-zinc-600">sin material</span>
                        ) : (
                          <button
                            onClick={() => tomar(r)}
                            disabled={guardando === r.codArticulo}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ml-auto ${
                              pidiendoNombre
                                ? "border-red-400 text-red-300"
                                : "border-zinc-700 text-zinc-200 hover:border-yellow-400 hover:text-yellow-400"
                            } disabled:opacity-40`}
                          >
                            {guardando === r.codArticulo ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Play size={14} />
                            )}
                            Tomar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!visibles.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                      {loading ? "Consultando la base…" : "Nada para mostrar acá"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {hechosHoy.length > 0 && (
          <div className="mt-6">
            <div className="text-sm text-zinc-400 mb-2">Terminados hoy</div>
            <Panel bodyClass="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Artículo</th>
                      <th className="text-left font-medium px-3 py-2">Embolsador</th>
                      <th className="text-left font-medium px-3 py-2">Inicio</th>
                      <th className="text-left font-medium px-3 py-2">Fin</th>
                      <th className="text-right font-medium px-3 py-2">Tiempo</th>
                      <th className="text-right font-medium px-3 py-2">Recomendado</th>
                      <th className="text-right font-medium px-3 py-2">Embolsado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hechosHoy.map((r) => (
                      <tr key={r.id} className="border-b border-zinc-900">
                        <td className="px-3 py-2">
                          <span className="font-mono text-zinc-300">{r.codArticulo}</span>
                          <span className="text-zinc-500 text-[12px]"> · {r.nombre}</span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{r.embolsador}</td>
                        <td className="px-3 py-2 text-zinc-400">{hora(r.inicio)}</td>
                        <td className="px-3 py-2 text-zinc-400">{r.fin ? hora(r.fin) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                          {r.fin
                            ? transcurrido(r.inicio, new Date(r.fin).getTime())
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                          {r.recomendado != null ? fmtNum(r.recomendado) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-100">
                          {r.cantidad != null ? fmtNum(r.cantidad) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
          Universo = artículos activos cuyo empaque es una bolsa
          (StkFer_Articulos.DetalleEmpaque), sin terminales. Cobertura = stock de
          CENTRAL fuera de PULMON_INGRESO ÷ venta máxima de un mes en los últimos
          6 meses (Magnus, las dos sub-empresas, criterio de venta de contaduría).
          A embolsar = venta máxima × {MESES_COBERTURA} − stock embolsado,
          topeado por lo que haya en el pulmón de ingreso. Orden: menor cobertura
          primero y, a igual cobertura, mayor venta.
        </p>
      </main>
    </div>
  );
}
