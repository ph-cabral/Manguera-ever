"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

export type Campos = Record<string, string | null>;
export type Tarjeta = {
  id: number;
  columnaId: number;
  tableroId: number;
  orden: number;
  campos: Campos;
  // Fecha/hora en que entró a columnaId actual (no confundir con campos.fecha, que es
  // un campo de negocio editable). Usado para autoordenar columnas sin orden manual.
  columnaDesde?: string;
};
export type Columna = { id: number; tableroId: number; nombre: string; orden: number; tarjetas: Tarjeta[] };
export type ColGlobal = { id: number; nombre: string; orden: number };
export type Tablero = {
  id: number;
  clave: string;
  nombre: string;
  columnas: Columna[];
  columnasGlobales: ColGlobal[];
  ocultas: number[];
};
export type CampoDef = {
  k: string;
  l: string;
  t: "text" | "textarea" | "date" | "select";
  opciones?: string[];
  auto?: boolean;
  /** Si es true, el select muestra un botón "+" para agregar opciones nuevas (persistidas). */
  extensible?: boolean;
};

export const DEFAULT_SCHEMA: { titleKey: string; fields: CampoDef[] } = {
  titleKey: "descripcion",
  fields: [
    { k: "fecha", l: "Fecha", t: "date", auto: true },
    { k: "descripcion", l: "Descripción", t: "textarea" },
    { k: "ubicacion", l: "Ubicación", t: "text" },
  ],
};

export const SCHEMAS: Record<string, { titleKey: string; fields: CampoDef[] }> = {
  sistema: {
    titleKey: "descripcion",
    fields: [
      { k: "fecha", l: "Fecha", t: "date", auto: true },
      { k: "descripcion", l: "Problema / solución", t: "textarea" },
      { k: "ubicacion", l: "Ubicación", t: "select", opciones: [], extensible: true },
      {
        k: "categoria",
        l: "Categoría",
        t: "select",
        opciones: ["Impresoras", "Automatización", "Mantenimiento de equipos", "Varios"],
        extensible: true,
      },
      { k: "importancia", l: "Importancia", t: "select", opciones: ["Alta", "Media", "Baja"] },
    ],
  },
  softech: {
    titleKey: "problema",
    fields: [
      // Inicio y Fin son automáticos: Inicio se completa solo al crear la tarjeta,
      // Fin al moverla a cualquier columna que no sea "Pendiente"/"En espera" (ver
      // esColumnaAbiertaSoftech en las rutas de la API). Ya no se tipean a mano; se
      // muestran como info de solo lectura arriba del formulario (ModalTarjeta).
      { k: "inicio", l: "Inicio", t: "date", auto: true },
      { k: "problema", l: "Problema", t: "select", opciones: [], extensible: true },
      { k: "sistema", l: "Sistema", t: "select", opciones: ["Magnus", "Prolixus", "WMS", "ecommerce", "SITD"] },
      { k: "fin", l: "Fin", t: "date", auto: true },
      {
        k: "origen",
        l: "Origen del error",
        t: "select",
        opciones: ["Cliente", "Personal", "Sistema", "Windows", "Desconocimiento"],
      },
      { k: "accion", l: "Acción / nota", t: "textarea" },
    ],
  },
  buren: {
    titleKey: "problema",
    fields: [
      { k: "fecha", l: "Fecha", t: "date" },
      { k: "ubicacion", l: "Ubicación", t: "text" },
      { k: "problema", l: "Problema", t: "text" },
      { k: "tiempo", l: "Tiempo (hh:mm)", t: "text" },
    ],
  },
};
export const schemaFor = (clave: string) => SCHEMAS[clave] ?? DEFAULT_SCHEMA;

const PALETTE = ["#5b8def", "#7c5bef", "#3ecf8e", "#e0b341", "#e0556b", "#3ec7cf", "#cf8de0"];

export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const FECHA_FIELD: Record<string, string> = { softech: "inicio" };
function fechaFieldFor(clave?: string) {
  return FECHA_FIELD[clave ?? ""] ?? "fecha";
}
function mesKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesAnteriorKey(d: Date) {
  return mesKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
// Columnas del tablero "sistema" con orden manual (drag habilitado). El resto
// de las columnas de ese tablero se autoordenan por fecha (más reciente arriba).
const COLUMNAS_ORDEN_MANUAL = ["para aprobacion", "pendiente", "en progreso"];
function esOrdenManual(nombre: string) {
  return COLUMNAS_ORDEN_MANUAL.includes(normalizar(nombre));
}
// Columnas "cerradas" del tablero "sistema": solo muestran tarjetas del mes en curso.
function esColumnaCerradaSistema(nombre: string) {
  const n = normalizar(nombre);
  return n.includes("resuelto") || n.includes("arreglado") || n.includes("sin solucionar");
}
// Columnas "abiertas" de Softech (mismo criterio que usa la API para completar
// campos.fin automáticamente: ver app/api/sistema/tarjetas/[id]/route.ts y
// tarjetas/reorder/route.ts). Cualquier otra columna de Softech se toma como cerrada.
const SOFTECH_COLUMNAS_ABIERTAS = ["pendiente", "en espera"];
// Detector genérico de "columna cerrada", válido para cualquier tablero — usado en
// Metricas() para saber, tarjeta por tarjeta, si su mes debe contarse por
// columnaDesde (cuándo entró a esa columna) en vez de por la fecha de negocio.
function esColumnaCerrada(clave: string | undefined, nombre: string) {
  if (clave === "sistema") return esColumnaCerradaSistema(nombre);
  if (clave === "softech") return !SOFTECH_COLUMNAS_ABIERTAS.includes(normalizar(nombre));
  // Resto de tableros (Buren y los que se agreguen después): mismo patrón genérico
  // que ya usa el tablero Kanban para columnas "cerradas" fuera de sistema/softech.
  return /resuelto|solucionado/i.test(nombre) && !/sin solu/i.test(nombre);
}
// Recorta etiquetas largas del eje Y de los gráficos de barras horizontales (Por
// ubicación / Por problema) para que no se corten entre sí; el nombre completo
// sigue disponible en el tooltip y en el panel de detalle al hacer clic.
function truncarEtiqueta(s: string) {
  const max = 30;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function mesLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}
function mesLabelCorto(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}
function countBy<T>(arr: T[], keyFn: (x: T) => string | undefined | null) {
  const map = new Map<string, number>();
  for (const item of arr) {
    const k = keyFn(item) || "(sin dato)";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

export async function apiJson(url: string, opts?: RequestInit) {
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export default function SistemaClient() {
  const [tableros, setTableros] = useState<Tablero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<string>("sistema");
  const [msg, setMsg] = useState("");
  const [configCols, setConfigCols] = useState(false);
  const [unificarAbierto, setUnificarAbierto] = useState(false);

  const [modalTarjeta, setModalTarjeta] = useState<{
    tarjeta: Tarjeta | null; // null = creando
    columnaId: number;
    clave: string;
    tableroId: number;
  } | null>(null);

  // Tarjetas desplegadas: el texto extra ya no se abre con hover, se togglea con
  // click sobre la tarjeta (segundo click la vuelve a contraer). La edición pasó
  // al lápiz, que está siempre visible.
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());
  const toggleExpandir = (id: number) =>
    setExpandidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  // ---------- drag & drop de tarjetas (pointer events, estilo Trello) ----------
  // Sin drag nativo HTML5: un clon de la tarjeta flota en un portal siguiendo el
  // puntero (inclinado, como Trello) y un bloque gris del tamaño real marca dónde
  // caería. En columnas con orden manual el bloque es posicional; en las
  // autoordenadas por fecha se resalta la columna entera (la posición la decide
  // columnaDesde, no el mouse).
  type DragData = { id: number; fromColId: number; w: number; h: number; dx: number; dy: number; card: Tarjeta };
  const drag = useRef<DragData | null>(null);
  const pendiente = useRef<{ id: number; colId: number; x: number; y: number; card: Tarjeta; el: HTMLElement } | null>(
    null
  );
  const [dragActivo, setDragActivo] = useState<DragData | null>(null);
  // dónde caería ahora mismo: index numérico = hueco en columna manual;
  // index null = columna autoordenada (solo se resalta, sin posición elegible)
  const [hover, setHover] = useState<{ colId: number; index: number | null } | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const puntero = useRef<{ x: number; y: number } | null>(null);

  const cargar = async () => {
    try {
      const data = await apiJson("/api/sistema");
      setTableros(data);
    } catch {
      setMsg("No se pudo cargar /api/sistema.");
    }
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const tablero = useMemo(() => tableros.find((t) => t.clave === tab), [tableros, tab]);

  const tablerosRef = useRef(tableros);
  tablerosRef.current = tableros;
  // Columnas con orden manual del tablero visible (hoy solo las tiene "sistema";
  // en el resto de tableros TODAS se autoordenan por fecha de entrada).
  const colsManual = useMemo(() => {
    const s = new Set<number>();
    if (tablero?.clave === "sistema")
      for (const c of tablero.columnas) if (esOrdenManual(c.nombre)) s.add(c.id);
    return s;
  }, [tablero]);
  const colsManualRef = useRef(colsManual);
  colsManualRef.current = colsManual;

  // Wrappers con identidad estable para poder sacar los listeners de window
  // aunque el componente re-renderice a mitad del drag.
  const moverPunteroRef = useRef<(e: PointerEvent) => void>(() => {});
  const soltarRef = useRef<() => void>(() => {});
  const cancelarRef = useRef<() => void>(() => {});
  const onDragMove = useRef((e: PointerEvent) => moverPunteroRef.current(e)).current;
  const onDragUp = useRef(() => soltarRef.current()).current;
  const onDragCancel = useRef(() => cancelarRef.current()).current;

  const terminarDrag = () => {
    pendiente.current = null;
    drag.current = null;
    setDragActivo(null);
    setHover(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
  };
  cancelarRef.current = terminarDrag;

  moverPunteroRef.current = (e: PointerEvent) => {
    puntero.current = { x: e.clientX, y: e.clientY };
    const p = pendiente.current;
    if (!drag.current && p) {
      // umbral de 6px: menos que eso sigue siendo un click (abre el modal)
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      const r = p.el.getBoundingClientRect();
      drag.current = {
        id: p.id,
        fromColId: p.colId,
        w: r.width,
        h: r.height,
        dx: Math.min(Math.max(p.x - r.left, 8), r.width - 8),
        dy: Math.min(Math.max(p.y - r.top, 8), r.height - 8),
        card: p.card,
      };
      setDragActivo(drag.current);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) rotate(4deg)`;
    }
    // ¿Sobre qué columna / hueco está el puntero? Los índices se calculan contra
    // el DOM visible, que durante el drag NO incluye la tarjeta arrastrada (el
    // original se desmonta), así que el hueco marcado es exactamente donde cae.
    const cols = boardRef.current?.querySelectorAll<HTMLElement>("[data-col-id]");
    let destino: { colId: number; index: number | null } | null = null;
    if (cols)
      for (const el of Array.from(cols)) {
        const r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) continue;
        const colId = Number(el.dataset.colId);
        if (!colsManualRef.current.has(colId)) {
          destino = { colId, index: null };
        } else {
          const cardEls = Array.from(el.querySelectorAll<HTMLElement>("[data-card-id]"));
          let idx = cardEls.length;
          for (let i = 0; i < cardEls.length; i++) {
            const cr = cardEls[i].getBoundingClientRect();
            if (e.clientY < cr.top + cr.height / 2) {
              idx = i;
              break;
            }
          }
          destino = { colId, index: idx };
        }
        break;
      }
    const prev = hoverRef.current;
    if (prev?.colId !== destino?.colId || prev?.index !== destino?.index) setHover(destino);
  };

  soltarRef.current = () => {
    const d = drag.current;
    const destino = hoverRef.current;
    terminarDrag();
    if (!d || !destino) return;

    const tcopy: Tablero[] = tablerosRef.current.map((t) => ({
      ...t,
      columnas: t.columnas.map((c) => ({ ...c, tarjetas: [...c.tarjetas] })),
    }));

    let card: Tarjeta | undefined;
    let srcCol: Columna | undefined;
    for (const t of tcopy)
      for (const c of t.columnas) {
        const idx = c.tarjetas.findIndex((tj) => tj.id === d.id);
        if (idx >= 0) {
          card = c.tarjetas[idx];
          srcCol = c;
          c.tarjetas.splice(idx, 1);
        }
      }
    if (!card || !srcCol) return;

    let destCol: Columna | undefined;
    for (const t of tcopy) for (const c of t.columnas) if (c.id === destino.colId) destCol = c;
    if (!destCol) return;
    // Columna autoordenada y no cambió de columna: nada que mover.
    if (destino.index === null && destCol.id === srcCol.id) return;

    // destino.index viene calculado contra la lista SIN la tarjeta arrastrada,
    // por eso insertar acá no sufre el off-by-one clásico de mover hacia abajo
    // dentro de la misma columna.
    const idx =
      destino.index === null
        ? destCol.tarjetas.length
        : Math.max(0, Math.min(destino.index, destCol.tarjetas.length));
    destCol.tarjetas.splice(idx, 0, {
      ...card,
      columnaId: destCol.id,
      // Optimista: el servidor confirma/persiste columnaDesde en el PATCH de abajo;
      // esto solo evita un parpadeo de orden hasta que refresque con cargar().
      columnaDesde: destCol.id !== srcCol.id ? new Date().toISOString() : card.columnaDesde,
    });

    const cambios: { id: number; columnaId: number; orden: number }[] = [];
    srcCol.tarjetas.forEach((tj, i) => cambios.push({ id: tj.id, columnaId: srcCol!.id, orden: i }));
    if (destCol.id !== srcCol.id) {
      destCol.tarjetas.forEach((tj, i) => cambios.push({ id: tj.id, columnaId: destCol!.id, orden: i }));
    }

    setTableros(tcopy);
    if (cambios.length) {
      apiJson("/api/sistema/tarjetas/reorder", {
        method: "PATCH",
        body: JSON.stringify({ cambios }),
      })
        .then(() => cargar())
        .catch(() => cargar());
    }
  };

  const onCardPointerDown = (e: React.PointerEvent, card: Tarjeta, colId: number) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("a")) return; // links (Jira) siguen clickeables
    pendiente.current = {
      id: card.id,
      colId,
      x: e.clientX,
      y: e.clientY,
      card,
      el: e.currentTarget as HTMLElement,
    };
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
  };

  // Escape cancela el drag (la tarjeta vuelve a su lugar).
  useEffect(() => {
    if (!dragActivo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminarDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActivo]);

  // Auto-scroll al arrastrar cerca de los bordes: horizontal del tablero y
  // vertical dentro de la columna bajo el puntero (como Trello).
  useEffect(() => {
    if (!dragActivo) return;
    const EDGE = 90;
    const MAX_SPEED = 20;
    let raf: number;
    const tick = () => {
      const el = boardRef.current;
      const p = puntero.current;
      if (el && p) {
        const rect = el.getBoundingClientRect();
        if (p.x < rect.left + EDGE) {
          el.scrollLeft -= MAX_SPEED * ((rect.left + EDGE - p.x) / EDGE);
        } else if (p.x > rect.right - EDGE) {
          el.scrollLeft += MAX_SPEED * ((p.x - (rect.right - EDGE)) / EDGE);
        }
        const colId = hoverRef.current?.colId;
        if (colId != null) {
          const lista = el.querySelector<HTMLElement>(`[data-col-id="${colId}"] [data-col-lista]`);
          if (lista) {
            const lr = lista.getBoundingClientRect();
            if (p.y < lr.top + 60) lista.scrollTop -= MAX_SPEED * ((lr.top + 60 - p.y) / 60);
            else if (p.y > lr.bottom - 60) lista.scrollTop += MAX_SPEED * ((p.y - (lr.bottom - 60)) / 60);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragActivo]);

  // ---------- tableros ----------
  const crearTablero = async () => {
    const nombre = window.prompt("Nombre del nuevo tablero (empresa/área):");
    if (!nombre || !nombre.trim()) return;
    const sugerida = nombre.trim().toLowerCase().replace(/\s+/g, "_");
    const clave = window.prompt("Clave corta y única (sin espacios):", sugerida);
    if (!clave || !clave.trim()) return;
    const r = await fetch("/api/sistema/tableros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: clave.trim(), nombre: nombre.trim() }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "No se pudo crear el tablero.");
      return;
    }
    const t = await r.json();
    await cargar();
    setTab(t.clave);
  };

  // ---------- columnas (globales) ----------
  const crearColumna = async () => {
    const nombre = window.prompt("Nombre de la nueva columna (vale para todos los tableros):");
    if (!nombre || !nombre.trim()) return;
    await apiJson("/api/sistema/columnas", {
      method: "POST",
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    cargar();
  };

  const renombrarColumna = async (col: Columna) => {
    const nombre = window.prompt("Nuevo nombre de columna:", col.nombre);
    if (!nombre || !nombre.trim() || nombre.trim() === col.nombre) return;
    await apiJson(`/api/sistema/columnas/${col.id}`, {
      method: "PATCH",
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    cargar();
  };

  const borrarColumna = async (col: Columna) => {
    if (!window.confirm(`¿Borrar columna "${col.nombre}" de TODOS los tableros? Las tarjetas se mueven a otra columna.`))
      return;
    const r = await fetch(`/api/sistema/columnas/${col.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "No se pudo borrar la columna.");
    }
    cargar();
  };

  const toggleColumna = async (tableroId: number, columnaId: number, oculta: boolean) => {
    await apiJson(`/api/sistema/tableros/${tableroId}/columnas`, {
      method: "PATCH",
      body: JSON.stringify({ columnaId, oculta }),
    });
    cargar();
  };

  const moverColumna = (tableroId: number, colId: number, dir: -1 | 1) => {
    const t = tableros.find((x) => x.id === tableroId);
    if (!t) return;
    // columnas son globales: reordenar sobre la lista global completa
    const cols = [...t.columnasGlobales].sort((a, b) => a.orden - b.orden);
    const idx = cols.findIndex((c) => c.id === colId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cols.length) return;
    [cols[idx], cols[j]] = [cols[j], cols[idx]];
    apiJson("/api/sistema/columnas/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orden: cols.map((c) => c.id) }),
    })
      .then(() => cargar())
      .catch(() => cargar());
  };

  // ---------- tarjetas ----------
  const borrarTarjeta = async (id: number) => {
    if (!window.confirm("¿Borrar esta tarjeta?")) return;
    await fetch(`/api/sistema/tarjetas/${id}`, { method: "DELETE" });
    setModalTarjeta(null);
    cargar();
  };

  const guardarTarjeta = async (campos: Campos, tableroId?: number) => {
    if (!modalTarjeta) return;
    if (modalTarjeta.tarjeta) {
      await apiJson(`/api/sistema/tarjetas/${modalTarjeta.tarjeta.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          campos: { ...campos, fecha: new Date().toISOString() },
          ...(tableroId !== undefined && tableroId !== modalTarjeta.tableroId ? { tableroId } : {}),
        }),
      });
    } else {
      // Timbra la fecha de alta automática al crear: "fecha" para los tableros
      // genéricos y, si el tablero usa otra clave (softech -> "inicio"), también esa
      // — nunca se pide a mano. Solo se setea acá, en la creación; no se vuelve a
      // tocar al editar (para no correrle la fecha de inicio a una tarjeta ya creada).
      const ff = fechaFieldFor(modalTarjeta.clave);
      const autoStamp: Campos = { fecha: new Date().toISOString() };
      if (ff !== "fecha") autoStamp[ff] = new Date().toISOString();
      await apiJson("/api/sistema/tarjetas", {
        method: "POST",
        body: JSON.stringify({
          columnaId: modalTarjeta.columnaId,
          tableroId: tableroId ?? modalTarjeta.tableroId,
          campos: { ...campos, ...autoStamp },
        }),
      });
    }
    setModalTarjeta(null);
    cargar();
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-zinc-400 flex items-center justify-center">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="sticky top-0 z-20 bg-[#151515] border-b border-zinc-800 px-6 h-14 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm">
          ← Inicio
        </Link>
        <h1 className="font-bold text-rose-500 text-lg">Sistema</h1>
        <Link
          href="/sistema/edit"
          className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1 ml-auto"
        >
          📋 Vista tabla / editar fechas
        </Link>
        {msg && <span className="text-amber-400 text-sm ml-4">{msg}</span>}
        <UsuarioActual className="ml-auto" />
      </header>

      <nav className="bg-[#1a1a1a] border-b border-zinc-800 px-6 flex gap-1 items-center overflow-x-auto scrollbar-hide">
        {tableros.map((t) => (
          <button
            key={t.clave}
            onClick={() => setTab(t.clave)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.clave
                ? "text-rose-400 border-rose-500"
                : "text-zinc-500 border-transparent hover:text-zinc-200"
            }`}
          >
            {t.nombre}
          </button>
        ))}
        <button
          onClick={crearTablero}
          className="px-3 py-3 text-sm font-medium text-zinc-500 hover:text-zinc-200 whitespace-nowrap"
          title="Agregar tablero"
        >
          ＋ Tablero
        </button>
        <button
          onClick={() => setTab("metricas")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            tab === "metricas"
              ? "text-rose-400 border-rose-500"
              : "text-zinc-500 border-transparent hover:text-zinc-200"
          }`}
        >
          📊 Métricas
        </button>
      </nav>

      <main className="px-6 py-6">
        {tab === "metricas" ? (
          <Metricas tableros={tableros} />
        ) : tablero ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <button
                onClick={() => setConfigCols((v) => !v)}
                className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1"
              >
                ⚙ Columnas visibles
              </button>
              {schemaFor(tablero.clave).fields.some((f) => f.t === "select" && f.extensible) && (
                <button
                  onClick={() => setUnificarAbierto(true)}
                  className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1"
                  title="Unificar valores duplicados (ubicación, categoría)"
                >
                  🧹 Unificar valores
                </button>
              )}
              {configCols && (
                <div className="flex flex-wrap gap-2">
                  {tablero.columnasGlobales.map((c) => {
                    const oculta = tablero.ocultas.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-1.5 text-xs text-zinc-300 bg-[#161616] border border-zinc-800 rounded-md px-2 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!oculta}
                          onChange={() => toggleColumna(tablero.id, c.id, !oculta)}
                        />
                        {c.nombre}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div ref={boardRef} className="flex items-start gap-3 overflow-x-auto pb-4 scrollbar-hide">
              {tablero.columnas.map((col) => {
                const sch = schemaFor(tablero.clave);
                const titleKey = sch.titleKey;
                const subtitleField = sch.fields.find((f) => f.t === "date");
                const esSistema = tablero.clave === "sistema";
                // Sistema: orden manual solo en "para aprobación" / "pendiente" / "en
                // progreso"; el resto se autoordena por fecha (más reciente arriba).
                const ordenManual = esSistema && esOrdenManual(col.nombre);
                const soloMesActual = esSistema
                  ? esColumnaCerradaSistema(col.nombre)
                  : /resuelto|solucionado/i.test(col.nombre) && !/sin solu/i.test(col.nombre);
                const mesActualG = mesKey(new Date());
                const mesCerradoG = mesAnteriorKey(new Date());

                const ordenadas = ordenManual
                  ? col.tarjetas
                  : [...col.tarjetas].sort((a, b) => {
                      // Autoorden: por fecha/hora de entrada a la columna (no de creación).
                      const da = parseDate(a.columnaDesde);
                      const db = parseDate(b.columnaDesde);
                      return (db?.getTime() ?? 0) - (da?.getTime() ?? 0);
                    });

                const tarjetasVisibles = soloMesActual
                  ? ordenadas.filter((card) => {
                      // Sistema: las columnas "cerradas" (Resuelto / Arreglado-Sin
                      // solucionar / No solucionado) filtran por columnaDesde, o sea
                      // cuándo ENTRÓ la tarjeta a esa columna este mes — no por
                      // campos.fecha (que puede ser un mes anterior si la tarjeta
                      // viene de otra columna). Así se ve todo lo que se cargó ahí
                      // en el mes en curso, sin importar el mes de las demás columnas.
                      if (esSistema) {
                        const d = parseDate(card.columnaDesde);
                        if (!d) return true;
                        return mesKey(d) === mesActualG;
                      }
                      const d = subtitleField ? parseDate(card.campos[subtitleField.k]) : null;
                      if (!d) return true;
                      const mk = mesKey(d);
                      return mk === mesActualG || mk === mesCerradoG;
                    })
                  : ordenadas;
                // Durante el drag el original se desmonta: los índices de hover se
                // calculan contra esta lista (sin la tarjeta arrastrada).
                const listaRender = dragActivo
                  ? tarjetasVisibles.filter((c) => c.id !== dragActivo.id)
                  : tarjetasVisibles;
                const hoverAca = hover?.colId === col.id;
                const hoverAuto = hoverAca && hover?.index === null;
                return (
                  <div
                    key={col.id}
                    data-col-id={col.id}
                    className={`group/col w-[272px] shrink-0 flex flex-col max-h-[calc(100vh-225px)] rounded-xl bg-[#16191d] shadow-[0_1px_2px_rgba(0,0,0,0.55)] ${
                      hoverAuto ? "ring-2 ring-rose-500/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                      <button
                        className="text-sm font-semibold text-zinc-200 truncate text-left flex-1"
                        onClick={() => renombrarColumna(col)}
                        title="Click para renombrar"
                      >
                        {col.nombre}{" "}
                        <span className="text-zinc-500 font-normal text-xs">
                          {tarjetasVisibles.length}
                          {soloMesActual && tarjetasVisibles.length !== col.tarjetas.length
                            ? ` de ${col.tarjetas.length}`
                            : ""}
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 text-zinc-500 opacity-0 group-hover/col:opacity-100 transition-opacity">
                        <button
                          onClick={() => moverColumna(tablero.id, col.id, -1)}
                          className="hover:text-zinc-200 px-1"
                          title="Mover izquierda"
                        >
                          ◀
                        </button>
                        <button
                          onClick={() => moverColumna(tablero.id, col.id, 1)}
                          className="hover:text-zinc-200 px-1"
                          title="Mover derecha"
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => borrarColumna(col)}
                          className="hover:text-red-400 px-1"
                          title="Borrar columna"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div
                      data-col-lista
                      className="flex-1 min-h-[6px] overflow-y-auto px-2 pb-1 flex flex-col gap-2 scrollbar-hide"
                    >
                      {hoverAuto && dragActivo && (
                        <div className="shrink-0 flex flex-col gap-1">
                          <p className="text-center text-[11px] text-zinc-500">columna ordenada por fecha</p>
                          {dragActivo.fromColId !== col.id && (
                            <div className="rounded-lg bg-white/[0.12]" style={{ height: dragActivo.h }} />
                          )}
                        </div>
                      )}
                      {listaRender.map((card, i) => (
                        <Fragment key={card.id}>
                          {hoverAca && dragActivo && hover?.index === i && (
                            <div className="shrink-0 rounded-lg bg-white/[0.12]" style={{ height: dragActivo.h }} />
                          )}
                          <div
                            data-card-id={card.id}
                            onPointerDown={(e) => onCardPointerDown(e, card, col.id)}
                            onClick={() => toggleExpandir(card.id)}
                            className="group cursor-pointer select-none"
                          >
                            <TarjetaVisual
                              card={card}
                              titleKey={titleKey}
                              subtitleField={subtitleField}
                              clave={tablero.clave}
                              abierta={dragActivo == null && expandidas.has(card.id)}
                              onEditar={() =>
                                setModalTarjeta({
                                  tarjeta: card,
                                  columnaId: col.id,
                                  clave: tablero.clave,
                                  tableroId: tablero.id,
                                })
                              }
                            />
                          </div>
                        </Fragment>
                      ))}
                      {hoverAca && dragActivo && hover?.index === listaRender.length && (
                        <div className="shrink-0 rounded-lg bg-white/[0.12]" style={{ height: dragActivo.h }} />
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setModalTarjeta({
                          tarjeta: null,
                          columnaId: col.id,
                          clave: tablero.clave,
                          tableroId: tablero.id,
                        })
                      }
                      className="mx-2 mb-2 mt-1 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 transition-colors"
                    >
                      ＋ Agregar tarjeta
                    </button>
                  </div>
                );
              })}

              <button
                onClick={crearColumna}
                className="w-[272px] shrink-0 self-start rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-zinc-500 hover:text-zinc-200 text-sm text-left px-4 py-3 transition-colors"
              >
                ＋ Agregar columna
              </button>
            </div>
          </>
        ) : null}
      </main>

      {modalTarjeta && (
        <ModalTarjeta
          modal={modalTarjeta}
          tableros={tableros}
          onClose={() => setModalTarjeta(null)}
          onSave={guardarTarjeta}
          onDelete={modalTarjeta.tarjeta ? () => borrarTarjeta(modalTarjeta.tarjeta!.id) : undefined}
        />
      )}

      {unificarAbierto && tablero && (
        <ModalUnificar
          tablero={tablero}
          onClose={() => setUnificarAbierto(false)}
          onDone={cargar}
        />
      )}

      {/* Clon flotante de la tarjeta arrastrada, inclinado como en Trello. */}
      {dragActivo &&
        tablero &&
        createPortal(
          <div
            ref={overlayRef}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: dragActivo.w,
              transform: `translate(${(puntero.current?.x ?? 0) - dragActivo.dx}px, ${
                (puntero.current?.y ?? 0) - dragActivo.dy
              }px) rotate(4deg)`,
              zIndex: 100,
              pointerEvents: "none",
            }}
          >
            <TarjetaVisual
              card={dragActivo.card}
              titleKey={schemaFor(tablero.clave).titleKey}
              subtitleField={schemaFor(tablero.clave).fields.find((f) => f.t === "date")}
              clave={tablero.clave}
              abierta={false}
              flotante
            />
          </div>,
          document.body
        )}
    </div>
  );
}

// Cuerpo visual de una tarjeta (se usa en la lista y en el clon flotante del drag).
function TarjetaVisual({
  card,
  titleKey,
  subtitleField,
  clave,
  abierta,
  onEditar,
  flotante,
}: {
  card: Tarjeta;
  titleKey: string;
  subtitleField?: CampoDef;
  clave: string;
  /** true = el resto del texto está desplegado (lo controla el click, no el hover) */
  abierta: boolean;
  /** abre el modal de edición desde el lápiz */
  onEditar?: () => void;
  flotante?: boolean;
}) {
  const txt = String(card.campos[titleKey] || "(sin descripción)");
  const [first, ...rest] = txt.split("\n");
  const sinUbicacion = clave === "sistema" && !card.campos.ubicacion;
  const sinCategoria = clave === "sistema" && !card.campos.categoria;
  const fecha = subtitleField ? parseDate(card.campos[subtitleField.k]) : null;
  const imp = String(card.campos.importancia ?? "");
  const impColor =
    imp === "Alta" ? "bg-red-500" : imp === "Media" ? "bg-amber-400" : imp === "Baja" ? "bg-emerald-500" : "";
  const chips = [card.campos.categoria, card.campos.sistema, card.campos.ubicacion].filter(Boolean) as string[];
  const bgBase = sinUbicacion
    ? "bg-rose-950/50"
    : sinCategoria
      ? "bg-amber-950/40"
      : "bg-[#22272b] group-hover:bg-[#282e33]";
  return (
    <div
      className={`rounded-lg px-3 py-2 ring-1 transition-[background-color,box-shadow] duration-150 ${bgBase} ${
        flotante
          ? "ring-white/10 shadow-2xl shadow-black/70 opacity-95"
          : "ring-white/[0.04] shadow-[0_1px_1px_rgba(0,0,0,0.45)] group-hover:ring-zinc-500/70"
      }`}
    >
      {impColor && (
        <span title={`Importancia ${imp}`} className={`block h-1.5 w-10 rounded-full mb-1.5 ${impColor}`} />
      )}
      <div className="flex items-start gap-1.5">
        <p className="flex-1 min-w-0 text-sm text-zinc-100 leading-snug whitespace-pre-line break-words">{first}</p>
        {onEditar && (
          <button
            type="button"
            title="Editar"
            aria-label="Editar tarjeta"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEditar();
            }}
            className="shrink-0 -mr-1 -mt-0.5 rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M12 20h9" strokeLinecap="round" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      {rest.length > 0 && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <p className="overflow-hidden text-sm text-zinc-400 whitespace-pre-line break-words">{rest.join("\n")}</p>
        </div>
      )}
      {(fecha || chips.length > 0 || (clave === "softech" && card.campos.jiraUrl)) && (
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {fecha && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-400">
              🕒 {fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
            </span>
          )}
          {chips.map((c) => (
            <span
              key={c}
              className="max-w-full truncate rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-400"
            >
              {c}
            </span>
          ))}
          {clave === "softech" && card.campos.jiraUrl && (
            <a
              href={card.campos.jiraUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] text-rose-300 hover:text-rose-200"
            >
              {card.campos.jiraKey} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function Combobox({
  value,
  options,
  placeholder,
  onChange,
  autoFocus,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      // ignorar el scroll interno de la propia lista (rueda del mouse sobre las opciones)
      if (dropRef.current && e.target instanceof Node && dropRef.current.contains(e.target)) return;
      setOpen(false);
    };
    // se cierra si el modal (u otro ancestro, no la lista) scrollea, para no quedar mal ubicado
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const q = value.trim().toLowerCase();
  const filtradas = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <div className="relative flex-1 min-w-0" ref={wrapRef}>
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        name={`cb-${placeholder}`}
        data-1p-ignore
        autoFocus={autoFocus}
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={(e) => {
          onChange(e.target.value);
          openDropdown();
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (!open || filtradas.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(filtradas.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            onChange(filtradas[highlight]);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtradas.length > 0 && pos &&
        createPortal(
          <div
            ref={dropRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 max-h-48 overflow-y-auto bg-[#1f1f1f] border border-zinc-700 rounded-md shadow-lg"
          >
            {filtradas.map((o, i) => (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-1.5 text-sm truncate ${
                  i === highlight ? "bg-zinc-700 text-white" : "text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {o}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function ModalTarjeta({
  modal,
  tableros,
  onClose,
  onSave,
  onDelete,
}: {
  modal: { tarjeta: Tarjeta | null; columnaId: number; clave: string; tableroId: number };
  tableros: Tablero[];
  onClose: () => void;
  onSave: (campos: Campos, tableroId?: number) => void;
  onDelete?: () => void;
}) {
  const schema = schemaFor(modal.clave);
  const primerCampo = schema.fields.find((f) => !f.auto)?.k;
  // Campo de fecha automática de este tablero ("fecha" en general, "inicio" en
  // softech) y, si existe, el campo "fin" automático — ambos de solo lectura.
  const fechaKey = fechaFieldFor(modal.clave);
  const campoFecha = schema.fields.find((f) => f.k === fechaKey);
  const campoFin = schema.fields.find((f) => f.k === "fin" && f.auto);
  const [campos, setCampos] = useState<Campos>(modal.tarjeta?.campos ?? {});
  // Tablero destino: por defecto el actual. Sirve para corregir una tarjeta
  // creada en el tablero equivocado sin borrarla y rehacerla (columnas son
  // globales, así que solo cambia el dueño).
  const [destinoTablero, setDestinoTablero] = useState(modal.tableroId);
  // Opciones dinámicas de los selects "extensibles" (categoría, ubicación), por campo.
  const [opcionesExtra, setOpcionesExtra] = useState<Record<string, string[]>>({});
  // Recorrido completo de columnas (solo tiene sentido si la tarjeta ya existe).
  const [historial, setHistorial] = useState<
    { columnaId: number; columnaNombre: string; entradaEn: string }[]
  >([]);

  useEffect(() => {
    apiJson(`/api/sistema/opciones?clave=${encodeURIComponent(modal.clave)}`)
      .then(setOpcionesExtra)
      .catch(() => {});
  }, [modal.clave]);

  useEffect(() => {
    if (!modal.tarjeta) {
      setHistorial([]);
      return;
    }
    apiJson(`/api/sistema/tarjetas/${modal.tarjeta.id}/historial`)
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }, [modal.tarjeta]);

  const agregarOpcion = async (campo: string, label: string) => {
    const valor = window.prompt(`Nueva opción para "${label}":`);
    if (!valor || !valor.trim()) return;
    const v = valor.trim();
    try {
      const lista = await apiJson("/api/sistema/opciones", {
        method: "POST",
        body: JSON.stringify({ clave: modal.clave, campo, valor: v }),
      });
      setOpcionesExtra((p) => ({ ...p, [campo]: lista }));
    } catch {
      setOpcionesExtra((p) => ({ ...p, [campo]: Array.from(new Set([...(p[campo] ?? []), v])) }));
    }
    setCampos((c) => ({ ...c, [campo]: v }));
  };

  // Nota: ya no se registra automáticamente al guardar lo tipeado a mano en un
  // select "extensible" — eso generaba sugerencias basura (typos, valores a medio
  // escribir). Para agregar una opción nueva y persistente hay que usar el botón "+".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSave(campos, destinoTablero);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [campos, destinoTablero, onClose, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4 text-zinc-100">
          {modal.tarjeta ? "Editar tarjeta" : "Nueva tarjeta"}
        </h2>

        {tableros.length > 1 && (
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mb-1 block">Tablero</label>
            <select
              value={destinoTablero}
              autoFocus={false}
              onChange={(e) => setDestinoTablero(Number(e.target.value))}
              className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
            >
              {tableros.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
            {destinoTablero !== modal.tableroId && (
              <p className="text-[11px] text-amber-400 mt-1">
                Se moverá a &quot;{tableros.find((t) => t.id === destinoTablero)?.nombre}&quot; al guardar.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500 mb-1">
            {campoFecha?.l ?? "Fecha"}:{" "}
            {campos[fechaKey] ? new Date(campos[fechaKey] as string).toLocaleString() : "—"}
          </p>
          {campoFin && (
            <p className="text-xs text-zinc-500 -mt-2 mb-1">
              {campoFin.l}:{" "}
              {campos.fin ? new Date(campos.fin as string).toLocaleString() : "— (en curso)"}
            </p>
          )}
          {modal.clave === "softech" && campos.jiraUrl && (
            <a
              href={campos.jiraUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-rose-400 hover:text-rose-300 -mt-2 mb-1"
              onClick={(e) => e.stopPropagation()}
            >
              Ver caso en Softech ({campos.jiraKey}) ↗
            </a>
          )}
          {modal.tarjeta && historial.length > 0 && (
            <div className="text-[11px] text-zinc-500 -mt-1 mb-1 border-l-2 border-zinc-800 pl-2 flex flex-col gap-0.5">
              {historial.map((h, i) => (
                <div key={i}>
                  Entró a &quot;{h.columnaNombre}&quot; — {new Date(h.entradaEn).toLocaleString()}
                </div>
              ))}
            </div>
          )}

          {schema.fields.map((f) => {
            if (f.auto) return null;
            // Opciones fijas del schema (curadas) + las extensibles persistidas
            // (opcionesExtra, ej. ubicación) + el valor con el que abrió la tarjeta
            // (para no vaciarlo al editar si ya no está en la lista curada).
            // Ojo: NO usar campos[f.k] (el valor en edición) — hacía que lo tipeado
            // apareciera como opción propia: "vick" listado además de "vicki".
            const valorOriginal = modal.tarjeta?.campos?.[f.k];
            const combinedOptions =
              f.t === "select"
                ? (() => {
                    const arr = Array.from(
                      new Set([
                        ...(f.opciones ?? []),
                        ...(f.extensible ? opcionesExtra[f.k] ?? [] : []),
                        ...(valorOriginal ? [String(valorOriginal)] : []),
                      ])
                    );
                    // Extensibles (ubicación, categoría) se muestran alfabéticas; las de
                    // orden fijo (ej. importancia) mantienen su orden original.
                    return f.extensible ? arr.sort((a, b) => a.localeCompare(b, "es")) : arr;
                  })()
                : [];
            return (
              <div key={f.k}>
                <label className="text-xs text-zinc-500 mb-1 block">{f.l}</label>
                {f.t === "textarea" ? (
                  <Textarea
                    value={campos[f.k] ?? ""}
                    autoFocus={!modal.tarjeta && f.k === primerCampo}
                    onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                  />
                ) : f.t === "select" ? (
                  <div className="flex gap-2">
                    <Combobox
                      value={String(campos[f.k] ?? "")}
                      options={combinedOptions}
                      placeholder="Escribí para buscar o crear…"
                      autoFocus={!modal.tarjeta && f.k === primerCampo}
                      onChange={(v) => setCampos((c) => ({ ...c, [f.k]: v }))}
                    />
                    {f.extensible && (
                      <button
                        type="button"
                        onClick={() => agregarOpcion(f.k, f.l)}
                        className="shrink-0 w-9 rounded-md border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-sm"
                        title={`Agregar ${f.l.toLowerCase()}`}
                      >
                        ＋
                      </button>
                    )}
                  </div>
                ) : (
                  <Input
                    type="text"
                    value={campos[f.k] ?? ""}
                    autoFocus={!modal.tarjeta && f.k === primerCampo}
                    onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5">
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Borrar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => onSave(campos, destinoTablero)}>
              Guardar
            </Button>
          </div>
        </div>
        <p className="hidden sm:block text-[11px] text-zinc-500 text-right mt-2">
          Esc cancela · Ctrl+Enter guarda
        </p>
      </div>
    </div>
  );
}

function ModalUnificar({
  tablero,
  onClose,
  onDone,
}: {
  tablero: Tablero;
  onClose: () => void;
  onDone: () => void;
}) {
  const schema = schemaFor(tablero.clave);
  const camposUnificables = schema.fields.filter((f) => f.t === "select" && f.extensible);
  const [campo, setCampo] = useState(camposUnificables[0]?.k ?? "");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const todasLasTarjetas = tablero.columnas.flatMap((c) => c.tarjetas);

  const conteos = Array.from(
    todasLasTarjetas.reduce((map, t) => {
      const v = String(t.campos[campo] ?? "").trim();
      if (!v) return map;
      map.set(v, (map.get(v) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => a[0].localeCompare(b[0], "es"));

  const toggle = (valor: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(valor)) next.delete(valor);
      else next.add(valor);
      return next;
    });
    setError("");
  };

  const unificar = async () => {
    if (seleccion.size < 2) {
      setError("Elegí al menos 2 valores para unificar.");
      return;
    }
    const destinoFinal = destino.trim() || Array.from(seleccion)[0];
    setTrabajando(true);
    setError("");
    try {
      const cambios = todasLasTarjetas.filter(
        (t) => seleccion.has(String(t.campos[campo] ?? "").trim()) && t.campos[campo] !== destinoFinal
      );
      for (const t of cambios) {
        await apiJson(`/api/sistema/tarjetas/${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ campos: { ...t.campos, [campo]: destinoFinal } }),
        });
      }
      await apiJson("/api/sistema/opciones", {
        method: "POST",
        body: JSON.stringify({ clave: tablero.clave, campo, valor: destinoFinal }),
      }).catch(() => {});
      for (const v of seleccion) {
        if (v === destinoFinal) continue;
        await apiJson("/api/sistema/opciones", {
          method: "DELETE",
          body: JSON.stringify({ clave: tablero.clave, campo, valor: v }),
        }).catch(() => {});
      }
      onDone();
      onClose();
    } catch {
      setError("Algo falló a mitad de camino. Revisá y reintentá si hace falta.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-1 text-zinc-100">Unificar valores duplicados</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Ej: &quot;pc mangueras&quot; y &quot;pc manguera&quot; → elegí ambos y definí el nombre final.
        </p>

        {camposUnificables.length > 1 && (
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mb-1 block">Campo</label>
            <select
              value={campo}
              onChange={(e) => {
                setCampo(e.target.value);
                setSeleccion(new Set());
                setDestino("");
              }}
              className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
            >
              {camposUnificables.map((f) => (
                <option key={f.k} value={f.k}>
                  {f.l}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1 mb-3 max-h-64 overflow-y-auto border border-zinc-800 rounded-md p-2">
          {conteos.length === 0 && (
            <p className="text-xs text-zinc-600 px-1 py-2">No hay valores cargados en este campo.</p>
          )}
          {conteos.map(([valor, n]) => (
            <label
              key={valor}
              className="flex items-center gap-2 text-sm text-zinc-200 px-2 py-1.5 rounded hover:bg-zinc-800/60 cursor-pointer"
            >
              <input type="checkbox" checked={seleccion.has(valor)} onChange={() => toggle(valor)} />
              <span className="flex-1 truncate">{valor}</span>
              <span className="text-xs text-zinc-500">{n}</span>
            </label>
          ))}
        </div>

        <label className="text-xs text-zinc-500 mb-1 block">Nombre final</label>
        <Input
          type="text"
          value={destino}
          placeholder={Array.from(seleccion)[0] ?? "Nombre unificado"}
          onChange={(e) => setDestino(e.target.value)}
        />

        {error && <p className="text-xs text-amber-400 mt-2">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={trabajando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={unificar} disabled={trabajando || seleccion.size < 2}>
            {trabajando ? "Unificando…" : `Unificar (${seleccion.size})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuedaMeses({
  opciones,
  selectedIndex,
  onChange,
  orientation,
  visible,
}: {
  opciones: string[];
  selectedIndex: number;
  onChange: (i: number) => void;
  orientation: "vertical" | "horizontal";
  visible: number;
}) {
  const CELL = orientation === "vertical" ? 44 : 88;
  const mid = Math.floor(visible / 2);
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelLock = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const mover = (delta: number) => {
    onChange(Math.max(0, Math.min(opciones.length - 1, selectedIndex + delta)));
  };
  // ref siempre con la última versión de mover/selectedIndex para el listener nativo.
  const moverRef = useRef(mover);
  moverRef.current = mover;

  // El onWheel de React se registra como passive y no puede frenar el scroll de
  // la página. Por eso el listener va nativo, con { passive: false }.
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelLock.current) return;
      wheelLock.current = true;
      const delta = orientation === "horizontal" && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      moverRef.current(delta > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLock.current = false;
      }, 160);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [orientation]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = touchStartY.current == null ? 0 : e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (orientation === "horizontal") {
      if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy)) return;
      mover(dx < 0 ? 1 : -1);
    } else {
      if (Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(dx)) return;
      mover(dy < 0 ? 1 : -1);
    }
  };

  const etiquetaChica = (m: string) => (m === "todos" ? "Todos" : mesLabelCorto(m));
  const etiquetaGrande = (m: string) => (m === "todos" ? "Todos" : mesLabel(m));

  const vertical = orientation === "vertical";

  return (
    <div
      className={
        vertical
          ? "fixed right-4 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col items-center gap-1 select-none"
          : "sticky top-14 z-20 flex lg:hidden items-center justify-center gap-1 select-none bg-[#0d0d0d]/95 backdrop-blur -mx-6 px-6 py-2 mb-3 border-b border-zinc-800"
      }
    >
      <button
        onClick={() => mover(-1)}
        className="text-zinc-600 hover:text-zinc-200 text-xs leading-none px-1 shrink-0"
        title="Mes más reciente"
      >
        {vertical ? "▲" : "◀"}
      </button>

      <div
        ref={wheelRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative overflow-hidden"
        style={vertical ? { width: 116, height: CELL * visible } : { width: CELL * visible, height: 52 }}
      >
        {/* ventana central, como la mirilla de una rueda de candado */}
        <div
          className={
            "pointer-events-none absolute bg-white/[0.03] " +
            (vertical ? "left-0 right-0 border-y border-zinc-700/70" : "top-0 bottom-0 border-x border-zinc-700/70")
          }
          style={vertical ? { top: CELL * mid, height: CELL } : { left: CELL * mid, width: CELL }}
        />
        <div
          className={`absolute transition-transform duration-300 ease-out ${
            vertical ? "left-0 right-0 flex flex-col" : "top-0 bottom-0 flex flex-row"
          }`}
          style={{
            transform: vertical
              ? `translateY(${(mid - selectedIndex) * CELL}px)`
              : `translateX(${(mid - selectedIndex) * CELL}px)`,
          }}
        >
          {opciones.map((m, i) => {
            const dist = Math.abs(i - selectedIndex);
            const estilo =
              dist === 0
                ? "text-base font-bold text-rose-400 scale-110"
                : dist === 1
                ? "text-xs text-zinc-300"
                : "text-[10px] text-zinc-600";
            return (
              <button
                key={m}
                onClick={() => onChange(i)}
                style={vertical ? { height: CELL } : { width: CELL }}
                className={`shrink-0 flex items-center justify-center text-center px-1 transition-all duration-200 ${estilo}`}
              >
                {dist === 0 ? etiquetaGrande(m) : etiquetaChica(m)}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => mover(1)}
        className="text-zinc-600 hover:text-zinc-200 text-xs leading-none px-1 shrink-0"
        title="Mes más antiguo"
      >
        {vertical ? "▼" : "▶"}
      </button>
    </div>
  );
}

function Kpi({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-[#161616] border border-zinc-800 rounded-xl p-4 shadow-sm">
      <div className="text-2xl font-bold text-rose-500">{value}</div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
    </div>
  );
}

function ChartBox({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#161616] border border-zinc-800 rounded-xl p-4 h-[30rem] shadow-sm ${className}`}>
      <h4 className="text-sm text-zinc-300 mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function SeccionTablero({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-rose-400 font-semibold text-sm uppercase tracking-wide mb-3 border-b border-zinc-800 pb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PanelUbicacion({
  name,
  cards,
  offset,
  onClose,
}: {
  name: string;
  cards: CardM[];
  offset: number;
  onClose: () => void;
}) {
  const [entrado, setEntrado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="absolute bg-[#1f1f1f] border border-zinc-700 rounded-xl shadow-2xl shadow-black/60 p-3 w-full transition-all duration-300 ease-out overflow-y-auto scrollbar-hide"
      style={{
        top: offset * 14,
        left: offset * 10,
        right: -offset * 4,
        zIndex: 20 + offset,
        maxHeight: 280,
        transform: entrado ? "translateX(0)" : "translateX(48px)",
        opacity: entrado ? 1 : 0,
      }}
    >
      <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#1f1f1f]">
        <h5 className="text-sm font-semibold text-zinc-100 truncate">{name}</h5>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500">{cards.length}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-rose-400 text-xs" title="Cerrar">
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <div key={c.id} className="bg-[#161616] border border-zinc-800 rounded-lg p-2">
            <p className="text-xs text-zinc-200 whitespace-pre-line">{c.campos.descripcion}</p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {c.campos.categoria || "—"} · {c.campos.importancia || "—"} · {c.colNombre}
            </p>
          </div>
        ))}
        {cards.length === 0 && <p className="text-xs text-zinc-600">Sin tarjetas.</p>}
      </div>
    </div>
  );
}

function PanelProblema({
  name,
  cards,
  offset,
  onClose,
}: {
  name: string;
  cards: CardM[];
  offset: number;
  onClose: () => void;
}) {
  const [entrado, setEntrado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="absolute bg-[#1f1f1f] border border-zinc-700 rounded-xl shadow-2xl shadow-black/60 p-3 w-full transition-all duration-300 ease-out overflow-y-auto scrollbar-hide"
      style={{
        top: offset * 14,
        left: offset * 10,
        right: -offset * 4,
        zIndex: 20 + offset,
        maxHeight: 280,
        transform: entrado ? "translateX(0)" : "translateX(48px)",
        opacity: entrado ? 1 : 0,
      }}
    >
      <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#1f1f1f]">
        <h5 className="text-sm font-semibold text-zinc-100 truncate">{name}</h5>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500">{cards.length}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-rose-400 text-xs" title="Cerrar">
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <div key={c.id} className="bg-[#161616] border border-zinc-800 rounded-lg p-2">
            <p className="text-xs text-zinc-200 whitespace-pre-line">{c.campos.accion || "(sin nota)"}</p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {c.campos.sistema || "—"} · {c.campos.origen || "—"} · {c.colNombre}
            </p>
          </div>
        ))}
        {cards.length === 0 && <p className="text-xs text-zinc-600">Sin tarjetas.</p>}
      </div>
    </div>
  );
}

type CardM = Tarjeta & { colNombre: string };

function Metricas({ tableros }: { tableros: Tablero[] }) {
  // aplanar todas las tarjetas con su columna; deduplicar por id.
  const all: CardM[] = tableros.flatMap((t) =>
    t.columnas.flatMap((c) => c.tarjetas.map((tj) => ({ ...tj, colNombre: c.nombre })))
  );
  const unicasAll = Array.from(new Map(all.map((tj) => [tj.id, tj])).values());

  const claveDe = (tableroId: number) => tableros.find((t) => t.id === tableroId)?.clave;
  // Fecha que define a qué mes pertenece la tarjeta para todo Metricas (KPIs y
  // gráficos): si está en una columna "cerrada" (Resuelto / Arreglado-Sin
  // solucionar / No solucionado en sistema, cerradas de Softech, o el patrón
  // genérico en el resto de tableros), se usa columnaDesde — cuándo ENTRÓ a esa
  // columna — para que cuente en el mes en que se resolvió, no en el mes en que
  // se creó. Si está en una columna abierta, se sigue usando la fecha de negocio
  // (fecha/inicio) como fecha de "registrado".
  const fechaDe = (tj: CardM) => {
    const clave = claveDe(tj.tableroId);
    if (esColumnaCerrada(clave, tj.colNombre)) {
      return parseDate(tj.columnaDesde) ?? parseDate(tj.campos[fechaFieldFor(clave)]);
    }
    return parseDate(tj.campos[fechaFieldFor(clave)]);
  };

  const mesActual = mesKey(new Date());
  const mesesCerrados = Array.from(
    new Set(unicasAll.map(fechaDe).filter((d): d is Date => !!d).map(mesKey))
  )
    .filter((m) => m < mesActual)
    .sort()
    .reverse();

  // opciones[0] = "todos"; opciones[1] = mes en curso; resto = meses cerrados (desc).
  const opciones = ["todos", mesActual, ...mesesCerrados];
  // arranca en "todos": los pie charts "por estado" (sisPorEstado/sfPorEstado,
  // más abajo) cuentan tarjetas por columna actual, no por mes de creación —
  // si arrancara filtrado por mes en curso, tarjetas viejas que siguen abiertas
  // (ej. "En desarrollo") quedaban afuera del conteo apenas se entraba a la
  // pantalla. El selector de mes sigue disponible para quien quiera acotar.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const idx = Math.max(0, Math.min(opciones.length - 1, selectedIndex));
  const mes = opciones[idx];

  const [pilaUbicacion, setPilaUbicacion] = useState<string[]>([]);
  const toggleUbicacion = (name: string) =>
    setPilaUbicacion((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const [pilaProblema, setPilaProblema] = useState<string[]>([]);
  const toggleProblema = (name: string) =>
    setPilaProblema((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const unicas =
    mes === "todos"
      ? unicasAll
      : unicasAll.filter((tj) => {
          const d = fechaDe(tj);
          return d && mesKey(d) === mes;
        });

  const idDe = (clave: string) => tableros.find((t) => t.clave === clave)?.id;
  const cardsDe = (id?: number) => (id == null ? [] : unicas.filter((tj) => tj.tableroId === id));

  const totalCards = unicas.length;

  const porEmpresa = tableros.map((t) => ({ name: t.nombre, value: cardsDe(t.id).length }));

  // ----- métricas específicas existentes (si los tableros existen) -----
  const sCards = cardsDe(idDe("sistema"));
  const sfCards = cardsDe(idDe("softech"));

  const diffs: number[] = [];
  for (const c of sfCards) {
    const a = parseDate(c.campos.inicio);
    const b = parseDate(c.campos.fin);
    if (a && b) diffs.push(Math.max(0, (b.getTime() - a.getTime()) / 86400000));
  }
  const avgDays = diffs.length ? (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1) : "—";

  const sisPorEstado = countBy(sCards, (c) => c.colNombre);
  const sisPorCategoria = countBy(sCards, (c) => c.campos.categoria).sort((a, b) => b.value - a.value);
  const sisPorUbicacion = countBy(sCards, (c) => c.campos.ubicacion).sort((a, b) => b.value - a.value);
  const topCategoria = sisPorCategoria[0];
  const topUbicacion = sisPorUbicacion[0];
  const sfPorEstado = countBy(sfCards, (c) => c.colNombre);
  const sfPorSistema = countBy(sfCards, (c) => c.campos.sistema);
  const sfPorProblema = countBy(sfCards, (c) => c.campos.problema).sort((a, b) => b.value - a.value);

  const sistemaTablero = tableros.find((t) => t.clave === "sistema");
  const softechTablero = tableros.find((t) => t.clave === "softech");
  const otrosTableros = tableros.filter((t) => t.clave !== "sistema" && t.clave !== "softech");

  return (
    <div>
      {/* mobile/tablet: rueda horizontal arriba, 3 meses visibles */}
      <RuedaMeses
        opciones={opciones}
        selectedIndex={idx}
        onChange={setSelectedIndex}
        orientation="horizontal"
        visible={3}
      />
      {/* desktop: rueda fija a la derecha, 5 meses visibles */}
      <RuedaMeses
        opciones={opciones}
        selectedIndex={idx}
        onChange={setSelectedIndex}
        orientation="vertical"
        visible={5}
      />

      {/* General: todos los sectores/tableros juntos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi value={totalCards} label="Casos totales registrados" />
      </div>
      <div className="grid grid-cols-1 gap-4 mb-8">
        <ChartBox title="Casos por empresa (cuenta a quién corresponde)">
          <BarChart data={porEmpresa}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
            <YAxis stroke="#a1a1aa" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
              labelStyle={{ color: "#f4f4f5" }}
              itemStyle={{ color: "#f4f4f5" }}
            />
            <Bar dataKey="value">
              {porEmpresa.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartBox>
      </div>

      {sistemaTablero && (
        <SeccionTablero title={sistemaTablero.nombre}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi value={sCards.length} label="Casos registrados" />
            <Kpi
              value={topCategoria ? topCategoria.name : "—"}
              label={`Categoría más frecuente${topCategoria ? ` (${topCategoria.value})` : ""}`}
            />
            <Kpi
              value={topUbicacion ? topUbicacion.name : "—"}
              label={`Ubicación más frecuente${topUbicacion ? ` (${topUbicacion.value})` : ""}`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartBox title="Por estado">
              <PieChart>
                <Pie data={sisPorEstado} dataKey="value" nameKey="name" outerRadius={130}>
                  {sisPorEstado.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: "#d4d4d8" }} />
                <Tooltip
                  contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                  labelStyle={{ color: "#f4f4f5" }}
                  itemStyle={{ color: "#f4f4f5" }}
                />
              </PieChart>
            </ChartBox>

            <ChartBox title="Por categoría">
              <PieChart>
                <Pie
                  data={sisPorCategoria}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={130}
                  label={({ name, x, y, textAnchor }: any) => (
                    <text x={x} y={y} textAnchor={textAnchor} fill="#e4e4e7" fontSize={11}>
                      {name}
                    </text>
                  )}
                >
                  {sisPorCategoria.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                  labelStyle={{ color: "#f4f4f5" }}
                  itemStyle={{ color: "#f4f4f5" }}
                />
              </PieChart>
            </ChartBox>

            <div className="bg-[#161616] border border-zinc-800 rounded-xl p-4 md:col-span-3 shadow-sm">
              <h4 className="text-sm text-zinc-300 mb-2">
                Por ubicación{" "}
                <span className="text-zinc-500 font-normal">(clic en una barra para ver el detalle)</span>
              </h4>
              <div className="flex flex-col md:flex-row gap-4">
                <div style={{ width: "100%", maxWidth: 460, height: Math.max(260, sisPorUbicacion.length * 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sisPorUbicacion} layout="vertical" margin={{ left: 8, right: 12 }}>
                      <CartesianGrid stroke="#27272a" horizontal={false} />
                      <XAxis type="number" stroke="#a1a1aa" fontSize={12} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#a1a1aa"
                        fontSize={11}
                        width={160}
                        tickFormatter={truncarEtiqueta}
                      />
                      <Tooltip
                        cursor={{ fill: "#ffffff0d" }}
                        contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                        labelStyle={{ color: "#f4f4f5" }}
                        itemStyle={{ color: "#f4f4f5" }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(d: any) => toggleUbicacion(d.name)}
                      >
                        {sisPorUbicacion.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={PALETTE[i % PALETTE.length]}
                            stroke={pilaUbicacion.includes(entry.name) ? "#f4f4f5" : "none"}
                            strokeWidth={pilaUbicacion.includes(entry.name) ? 2 : 0}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div
                  className="relative flex-1"
                  style={{ minHeight: Math.max(180, Math.min(260, sisPorUbicacion.length * 32)) }}
                >
                  {pilaUbicacion.length === 0 ? (
                    <p className="text-xs text-zinc-600 h-full flex items-center">
                      Elegí una ubicación en el gráfico para ver sus tarjetas acá.
                    </p>
                  ) : (
                    pilaUbicacion.map((name, i) => (
                      <PanelUbicacion
                        key={name}
                        name={name}
                        cards={sCards.filter((c) => (c.campos.ubicacion || "(sin dato)") === name)}
                        offset={i}
                        onClose={() => toggleUbicacion(name)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </SeccionTablero>
      )}

      {softechTablero && (
        <SeccionTablero title={softechTablero.nombre}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi value={sfCards.length} label="Casos registrados" />
            <Kpi value={avgDays} label="Días promedio de resolución" />
            {sfPorEstado.map((e) => (
              <Kpi
                key={e.name}
                value={`${sfCards.length ? Math.round((e.value / sfCards.length) * 100) : 0}%`}
                label={e.name}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartBox title="Por estado">
              <PieChart>
                <Pie data={sfPorEstado} dataKey="value" nameKey="name" outerRadius={130}>
                  {sfPorEstado.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: "#d4d4d8" }} />
                <Tooltip
                  contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                  labelStyle={{ color: "#f4f4f5" }}
                  itemStyle={{ color: "#f4f4f5" }}
                />
              </PieChart>
            </ChartBox>

            <ChartBox title="Sistema afectado" className="md:col-span-2">
              <BarChart data={sfPorSistema}>
                <CartesianGrid stroke="#27272a" />
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis stroke="#a1a1aa" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                  labelStyle={{ color: "#f4f4f5" }}
                  itemStyle={{ color: "#f4f4f5" }}
                />
                <Bar dataKey="value">
                  {sfPorSistema.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartBox>

            <div className="bg-[#161616] border border-zinc-800 rounded-xl p-4 md:col-span-3 shadow-sm">
              <h4 className="text-sm text-zinc-300 mb-2">
                Por problema{" "}
                <span className="text-zinc-500 font-normal">(clic en una barra para ver el detalle)</span>
              </h4>
              <div className="flex flex-col md:flex-row gap-4">
                <div style={{ width: "100%", maxWidth: 460, height: Math.max(260, sfPorProblema.length * 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sfPorProblema} layout="vertical" margin={{ left: 8, right: 12 }}>
                      <CartesianGrid stroke="#27272a" horizontal={false} />
                      <XAxis type="number" stroke="#a1a1aa" fontSize={12} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#a1a1aa"
                        fontSize={11}
                        width={190}
                        tickFormatter={truncarEtiqueta}
                      />
                      <Tooltip
                        cursor={{ fill: "#ffffff0d" }}
                        contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                        labelStyle={{ color: "#f4f4f5" }}
                        itemStyle={{ color: "#f4f4f5" }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(d: any) => toggleProblema(d.name)}
                      >
                        {sfPorProblema.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={PALETTE[i % PALETTE.length]}
                            stroke={pilaProblema.includes(entry.name) ? "#f4f4f5" : "none"}
                            strokeWidth={pilaProblema.includes(entry.name) ? 2 : 0}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div
                  className="relative flex-1"
                  style={{ minHeight: Math.max(180, Math.min(260, sfPorProblema.length * 32)) }}
                >
                  {pilaProblema.length === 0 ? (
                    <p className="text-xs text-zinc-600 h-full flex items-center">
                      Elegí un problema en el gráfico para ver sus tarjetas acá.
                    </p>
                  ) : (
                    pilaProblema.map((name, i) => (
                      <PanelProblema
                        key={name}
                        name={name}
                        cards={sfCards.filter((c) => (c.campos.problema || "(sin dato)") === name)}
                        offset={i}
                        onClose={() => toggleProblema(name)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </SeccionTablero>
      )}

      {otrosTableros.map((t) => {
        const cards = cardsDe(t.id);
        const porEstado = countBy(cards, (c) => c.colNombre).sort((a, b) => b.value - a.value);
        return (
          <SeccionTablero key={t.id} title={t.nombre}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Kpi value={cards.length} label="Casos registrados" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ChartBox title="Por estado">
                <PieChart>
                  <Pie data={porEstado} dataKey="value" nameKey="name" outerRadius={130}>
                    {porEstado.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11, color: "#d4d4d8" }} />
                  <Tooltip
                    contentStyle={{ background: "#1f1f1f", border: "1px solid #3f3f46" }}
                    labelStyle={{ color: "#f4f4f5" }}
                    itemStyle={{ color: "#f4f4f5" }}
                  />
                </PieChart>
              </ChartBox>
            </div>
          </SeccionTablero>
        );
      })}
    </div>
  );
}
