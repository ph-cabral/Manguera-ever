"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, UserPlus, ShieldCheck, ShieldOff, KeyRound, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type U = {
  id: number;
  dni: string;
  nombre: string;
  rol: string;
  sector: string | null;
  vendedorCodigo: number | null;
  // Ve el 100% de la empresa en /ventas/bulones aunque no sea ADMIN
  // (columna "Bulonería"). Ver lib/ventas/bulonesAcceso.ts.
  bulonesAccesoTotal: boolean;
  // Puede pedirle a Vicki (el chat) su facturación/ranking de ventas
  // (columna "Vicki datos"). SIEMPRE filtrado por su vendedorCodigo — ver
  // lib/ventas/vickiVentasAcceso.ts.
  vickiVentasAcceso: boolean;
  // Puede pedirle a Vicki datos de ASISTENCIA — faltas, feriados, horas extra
  // (columna "Vicki RRHH"). OJO: no se filtra por persona, ve a toda la
  // empresa. Ver lib/rrhh/vickiRrhhAcceso.ts.
  vickiRrhhAcceso: boolean;
  activo: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
};

// Catálogo de Magnus, maestro `Vendedores` (ver indicadores-api/cartera.py
// para por qué este y no `Ped_Usu_Arma`). Viene completo, con banderas:
//   activo  → habilitado en Magnus (los de baja se listan igual, marcados,
//             para poder ver a quién apunta un usuario ya asignado).
//   persona → no es un canal/zona (MOSTRADORES, ZONA CBA, …). Acá se pueden
//             asignar igual; el filtro de /ventas/vendedor sí los excluye.
type Vendedor = {
  codigo: number;
  nombre: string | null;
  activo?: boolean;
  persona?: boolean;
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function UsuariosClient() {
  const [items, setItems] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [resetUser, setResetUser] = useState<U | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  // Catálogo de vendedores (Magnus, Ped_Usu_Arma) para la columna
  // "Vendedor" — 2026-08-14, acceso por vendedor en
  // /ventas/vendedor. Se trae una sola vez, catálogo chico. Desde
  // 2026-08-27 ya no alimenta un combo: el número se TIPEA y el catálogo
  // sirve para validarlo y mostrar el nombre (ver CeldaVendedor).
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedoresError, setVendedoresError] = useState(false);

  const puedeResetear = pwd.length >= 6 && pwd === pwd2;

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/usuarios");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      setItems(d.items);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/admin/usuarios/vendedores")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.vendedores)) setVendedores(d.vendedores);
        else setVendedoresError(true);
      })
      .catch(() => setVendedoresError(true));
  }, []);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success("Usuario actualizado");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar");
    } finally {
      setBusy(null);
    }
  }

  function openReset(u: U) {
    setResetUser(u);
    setPwd("");
    setPwd2("");
  }

  function closeReset() {
    setResetUser(null);
    setPwd("");
    setPwd2("");
  }

  async function resetPassword() {
    if (!resetUser || !puedeResetear) return;
    setSavingPwd(true);
    try {
      const r = await fetch(`/api/admin/usuarios/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success(`Contraseña de ${resetUser.nombre} actualizada`);
      closeReset();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar la contraseña");
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-medium">Usuarios</h1>
        <span className="text-sm text-muted-foreground">({items.length})</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refrescar
          </Button>
          <Link href="/admin/usuarios/nuevo" className={buttonVariants({ size: "sm" })}>
            <UserPlus /> Nuevo
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">DNI</th>
              <th className="px-3 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 font-medium">Vendedor</th>
              <th className="px-3 py-2 font-medium">Bulonería</th>
              <th className="px-3 py-2 font-medium">Vicki datos</th>
              <th className="px-3 py-2 font-medium">Vicki RRHH</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Último acceso</th>
              <th className="px-3 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="inline size-5 animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  Todavía no hay usuarios.
                </td>
              </tr>
            ) : (
              items.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">{u.nombre}</td>
                  <td className="px-3 py-2 tabular-nums">{u.dni}</td>
                  <td className="px-3 py-2">{u.sector || "—"}</td>
                  <td className="px-3 py-2">
                    <CeldaVendedor
                      usuario={u}
                      vendedores={vendedores}
                      vendedoresError={vendedoresError}
                      disabled={busy === u.id}
                      onGuardar={(codigo) => patch(u.id, { vendedorCodigo: codigo })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CeldaBulones
                      usuario={u}
                      disabled={busy === u.id}
                      onCambiar={(v) => patch(u.id, { bulonesAccesoTotal: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CeldaVickiVentas
                      usuario={u}
                      disabled={busy === u.id}
                      onCambiar={(v) => patch(u.id, { vickiVentasAcceso: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CeldaVickiRrhh
                      usuario={u}
                      disabled={busy === u.id}
                      onCambiar={(v) => patch(u.id, { vickiRrhhAcceso: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        u.rol === "ADMIN"
                          ? "rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-xs"
                          : "rounded-full bg-secondary px-2 py-0.5 text-xs"
                      }
                    >
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.activo ? (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">activo</span>
                    ) : (
                      <span className="rounded-full bg-gray-200 text-gray-600 px-2 py-0.5 text-xs">inactivo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(u.ultimoAcceso)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy === u.id}
                        onClick={() => openReset(u)}
                      >
                        <KeyRound /> Contraseña
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy === u.id}
                        onClick={() => patch(u.id, { rol: u.rol === "ADMIN" ? "USUARIO" : "ADMIN" })}
                      >
                        {u.rol === "ADMIN" ? <ShieldOff /> : <ShieldCheck />}
                        {u.rol === "ADMIN" ? "Quitar admin" : "Hacer admin"}
                      </Button>
                      <Button
                        variant={u.activo ? "destructive" : "secondary"}
                        size="xs"
                        disabled={busy === u.id}
                        onClick={() => patch(u.id, { activo: !u.activo })}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Nota: los cambios de rol o de permisos se aplican la próxima vez que la persona inicia sesión. El
        vendedor asignado, en cambio, se aplica al toque (no hace falta relogin).
      </p>

      <PanelAntecesores vendedores={vendedores} vendedoresError={vendedoresError} />

      {resetUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !savingPwd && closeReset()}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-background p-4 shadow-lg ring-1 ring-foreground/10 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="flex items-center gap-1.5 text-base font-medium">
                <KeyRound className="size-4" /> Cambiar contraseña
              </h2>
              <p className="text-sm text-muted-foreground">
                {resetUser.nombre} · DNI {resetUser.dni}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newpass">Nueva contraseña</Label>
              <Input
                id="newpass"
                type="password"
                autoFocus
                placeholder="mín. 6 caracteres"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newpass2">Repetir contraseña</Label>
              <Input
                id="newpass2"
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && puedeResetear && resetPassword()}
              />
            </div>
            {pwd2.length > 0 && pwd !== pwd2 && (
              <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeReset} disabled={savingPwd}>
                Cancelar
              </Button>
              <Button size="sm" onClick={resetPassword} disabled={!puedeResetear || savingPwd}>
                {savingPwd ? "Guardando…" : "Guardar"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              La persona ingresa con esta contraseña en su próximo inicio de sesión.
              Comunicásela de forma segura.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Celda "Bulonería": quién ve TODA la empresa en /ventas/bulones y quién ve
 * sólo su cartera (2026-08-28). Antes esto era una lista de nombres en el
 * código — ahora lo asigna el admin con un click, y sale de la bandera
 * `usuario.bulonesAccesoTotal` (ver lib/ventas/bulonesAcceso.ts).
 *
 * Alcance: la línea de bulonería, o sea /ventas/bulones y /ventas/presupuestos.
 * Un usuario con "toda la empresa" acá sigue viendo únicamente su cartera en
 * /ventas/vendedor y en el resto de la app.
 *
 * Desde 2026-08-31 la bandera hace DOS cosas (ver lib/auth/permissions.ts):
 *   1. QUÉ DATOS ve dentro de esas vistas: toda la empresa en vez de su
 *      cartera. Toma efecto en la próxima consulta, sin relogin — se resuelve
 *      en vivo contra Postgres (ver resolverAccesoVendedor).
 *   2. SI PUEDE ENTRAR a esas vistas, aunque su sector no las tenga
 *      habilitadas. Los permisos de vista son por sector, así que ésta es la
 *      única forma de dárselas a una persona sola (el responsable de la
 *      línea) sin dárselas a todos los vendedores. Esto viaja horneado en la
 *      cookie: recién le cambia el acceso CUANDO VUELVE A LOGUEAR.
 *
 * Los ADMIN no se muestran conmutables: ya ven todo en cualquier vista, la
 * bandera no les cambia nada.
 */
function CeldaBulones({
  usuario,
  disabled,
  onCambiar,
}: {
  usuario: U;
  disabled: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  if (usuario.rol === "ADMIN") {
    return (
      <span className="text-xs text-muted-foreground" title="Los admin ya ven toda la empresa en todas las vistas">
        toda la empresa (admin)
      </span>
    );
  }

  const total = usuario.bulonesAccesoTotal;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCambiar(!total)}
      title={
        total
          ? "Entra a Ventas → Bulonería y Presupuestos, y ahí ve toda la empresa. Click para volver a filtrarlo por su vendedor (el acceso a las vistas se le va en el próximo login)."
          : "Ve sólo los clientes de su vendedor en Ventas → Bulonería. Click para darle toda la empresa + acceso a Presupuestos (aplica cuando vuelva a loguear)."
      }
      className={
        "rounded-full px-2 py-0.5 text-xs transition disabled:opacity-50 " +
        (total
          ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
          : "bg-secondary text-muted-foreground hover:bg-accent")
      }
    >
      {total ? "toda la empresa" : "su cartera"}
    </button>
  );
}

/**
 * Celda "Vicki datos": quién puede pedirle a Vicki (el chat) su facturación
 * o ranking de ventas (2026-09-05). A diferencia de bulonería, acá NO hay
 * excepción de "toda la empresa" — el que está habilitado ve únicamente su
 * propio vendedorCodigo (o cero datos si todavía no tiene uno asignado). Los
 * ADMIN ya pueden pedirlo todo, sin bandera — ver lib/ventas/vickiVentasAcceso.ts.
 */
function CeldaVickiVentas({
  usuario,
  disabled,
  onCambiar,
}: {
  usuario: U;
  disabled: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  if (usuario.rol === "ADMIN") {
    return (
      <span className="text-xs text-muted-foreground" title="Los admin ya pueden pedirle a Vicki los datos de cualquier vendedor">
        sin restricción (admin)
      </span>
    );
  }

  const habilitado = usuario.vickiVentasAcceso;
  const sinVendedor = usuario.vendedorCodigo == null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCambiar(!habilitado)}
      title={
        sinVendedor && !habilitado
          ? "Asignale primero un vendedor (columna anterior): sin eso, aunque lo habilites, Vicki no le va a mostrar nada"
          : habilitado
          ? "Puede pedirle a Vicki su facturación/ranking, siempre filtrado por su propio vendedor. Click para quitarle el acceso."
          : "No puede pedirle datos de ventas a Vicki. Click para habilitarlo (verá solo su cartera)."
      }
      className={
        "rounded-full px-2 py-0.5 text-xs transition disabled:opacity-50 " +
        (habilitado
          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
          : "bg-secondary text-muted-foreground hover:bg-accent")
      }
    >
      {habilitado ? "habilitado" : "sin acceso"}
    </button>
  );
}

/**
 * Celda "Vicki RRHH": quién puede pedirle a Vicki datos de asistencia — días
 * de falta de una persona, feriados registrados, horas extra (2026-09-07).
 *
 * A diferencia de "Vicki datos" (ventas), acá NO hay recorte por persona: el
 * que está habilitado ve la asistencia de TODA la empresa, porque un dato de
 * RRHH a medias no sirve ("quién hizo horas extras" necesita la lista
 * completa). Habilitar a alguien es darle la asistencia de sus compañeros —
 * darlo sólo a RRHH. Los ADMIN ya lo tienen sin bandera; ver
 * lib/rrhh/vickiRrhhAcceso.ts.
 */
function CeldaVickiRrhh({
  usuario,
  disabled,
  onCambiar,
}: {
  usuario: U;
  disabled: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  if (usuario.rol === "ADMIN") {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Los admin ya pueden pedirle a Vicki los datos de asistencia"
      >
        sin restricción (admin)
      </span>
    );
  }

  const habilitado = usuario.vickiRrhhAcceso;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCambiar(!habilitado)}
      title={
        habilitado
          ? "Puede preguntarle a Vicki por faltas, feriados y horas extra de TODA la empresa. Click para quitarle el acceso."
          : "No puede pedirle datos de asistencia a Vicki. Click para habilitarlo — atención: verá la asistencia de todos, no sólo la suya."
      }
      className={
        "rounded-full px-2 py-0.5 text-xs transition disabled:opacity-50 " +
        (habilitado
          ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
          : "bg-secondary text-muted-foreground hover:bg-accent")
      }
    >
      {habilitado ? "habilitado" : "sin acceso"}
    </button>
  );
}

/**
 * Celda "Vendedor" de la tabla de usuarios — se TIPEA el número de vendedor
 * de Magnus, o parte del nombre, y con Enter se resuelve (
 * 2026-08-27; antes era un combo con todos los nombres del catálogo).
 *
 * Por qué además de número se puede buscar por nombre: el número que uno
 * tiene a mano NO siempre es el de este maestro. En Magnus conviven DOS
 * maestros de vendedor con el mismo rango de códigos y personas distintas
 * en cada código (`Vendedores` y `Ped_Usu_Arma` — ver la nota larga en
 * indicadores-api/clientes.py). Todo el sistema usa Ped_Usu_Arma, así que
 * un número sacado de otra pantalla puede no existir acá o, peor, existir
 * apuntando a otra persona. Buscando por nombre se ve el código correcto.
 *
 * Reglas del Enter:
 *   · Vacío → "Sin asignar" (vendedorCodigo = null).
 *   · Número que existe en el catálogo → guarda.
 *   · Cualquier otra cosa (texto, o un número que no existe) → busca por
 *     código y por nombre (sin acentos, sin distinguir mayúsculas):
 *       1 resultado  → guarda directo.
 *       varios       → los lista para elegir con un click.
 *       ninguno      → avisa y no guarda (un código inexistente se traduce
 *                      en "no ve ningún cliente" en /ventas/vendedor, y eso
 *                      es difícil de diagnosticar después).
 *   · Escape vuelve al valor guardado y cierra la lista.
 *
 * Si el catálogo de Magnus no cargó (`vendedoresError`) no hay con qué
 * buscar ni validar: se acepta el número tipeado tal cual y el title lo
 * aclara.
 */
function CeldaVendedor({
  usuario,
  vendedores,
  vendedoresError,
  disabled,
  onGuardar,
}: {
  usuario: U;
  vendedores: Vendedor[];
  vendedoresError: boolean;
  disabled: boolean;
  onGuardar: (codigo: number | null) => void;
}) {
  const [texto, setTexto] = useState(
    usuario.vendedorCodigo == null ? "" : String(usuario.vendedorCodigo),
  );
  const [matches, setMatches] = useState<Vendedor[] | null>(null);

  // Si el usuario se recarga desde el back (load() tras guardar) el input
  // tiene que reflejar el valor real, no lo que quedó tipeado.
  useEffect(() => {
    setTexto(usuario.vendedorCodigo == null ? "" : String(usuario.vendedorCodigo));
    setMatches(null);
  }, [usuario.vendedorCodigo]);

  const guardado =
    usuario.vendedorCodigo == null
      ? null
      : vendedores.find((v) => v.codigo === usuario.vendedorCodigo) ?? null;
  const nombreGuardado = guardado?.nombre ?? null;

  const normalizar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  function asignar(codigo: number) {
    setMatches(null);
    if (codigo !== usuario.vendedorCodigo) onGuardar(codigo);
  }

  function confirmar() {
    const t = texto.trim();
    setMatches(null);
    if (t === "") {
      if (usuario.vendedorCodigo != null) onGuardar(null);
      return;
    }

    const esNumero = /^[0-9]+$/.test(t);

    // Sin catálogo no hay nada que validar ni buscar: se guarda el número
    // tal cual (y si es texto, no hay forma de resolverlo).
    if (vendedoresError || vendedores.length === 0) {
      if (!esNumero) {
        toast.error("No se pudo cargar el catálogo de Magnus — escribí el número de vendedor");
        return;
      }
      asignar(Number(t));
      return;
    }

    if (esNumero) {
      const exacto = vendedores.find((v) => v.codigo === Number(t));
      if (exacto) {
        asignar(exacto.codigo);
        return;
      }
    }

    const q = normalizar(t);
    const encontrados = vendedores.filter(
      (v) => String(v.codigo).includes(q) || normalizar(v.nombre ?? "").includes(q),
    );
    if (encontrados.length === 0) {
      toast.error(
        esNumero
          ? `No existe el vendedor ${t} en Magnus — probá escribiendo el apellido`
          : `Ningún vendedor coincide con "${t}"`,
      );
      return;
    }
    if (encontrados.length === 1) {
      asignar(encontrados[0].codigo);
      return;
    }
    setMatches(encontrados.slice(0, 20));
  }

  return (
    <div className="relative flex flex-col gap-0.5">
      <input
        type="text"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          setTexto(e.target.value);
          setMatches(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmar();
          } else if (e.key === "Escape") {
            setTexto(usuario.vendedorCodigo == null ? "" : String(usuario.vendedorCodigo));
            setMatches(null);
          }
        }}
        placeholder="N° o nombre"
        title={
          vendedoresError
            ? "No se pudo cargar el catálogo de vendedores de Magnus — se guarda el número sin verificar el nombre"
            : "Escribí el número de vendedor de Magnus (o parte del apellido) y presioná Enter"
        }
        className="w-36 rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-50"
      />

      {matches && matches.length > 0 && (
        <div className="absolute top-full left-0 z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {matches.map((v) => (
            <button
              key={v.codigo}
              type="button"
              onClick={() => asignar(v.codigo)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="tabular-nums text-muted-foreground w-12 shrink-0">{v.codigo}</span>
              <span className="truncate">{v.nombre ?? "(sin nombre)"}</span>
              {v.activo === false && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">baja</span>
              )}
            </button>
          ))}
        </div>
      )}

      <span className="text-xs text-muted-foreground">
        {usuario.vendedorCodigo == null
          ? "Sin asignar"
          : `${usuario.vendedorCodigo} — ${nombreGuardado ?? "(no existe en Magnus)"}`}
        {guardado?.activo === false && " · de baja"}
      </span>
    </div>
  );
}

/**
 * Sucesión de vendedores (2026-09-08) — quién se quedó con la cartera de
 * quién.
 *
 * POR QUÉ ESTÁ ACÁ. Desde esta fecha /ventas/vendedor, /ventas/bulones y
 * /ventas/faltantes cortan por el vendedor DEL COMPROBANTE
 * (Ven_CompCabecera.vendedor), que es el mismo eje del pivot
 * Ventas_Debitos_Creditos y de ventas_subempresa_mensual: por eso los números
 * de la vista cierran al peso con los del pivot. Antes cortaban por la
 * CARTERA del cliente y pasaban dos cosas feas — un vendedor se llevaba
 * ventas emitidas con otro código sobre sus mismos clientes, y un cliente que
 * caía en la cartera de dos vendedores sumaba en las dos pantallas (la suma
 * de todas las vistas daba MÁS que el total de la empresa).
 *
 * El eje comprobante solo no alcanza: cuando alguien se va, su venta vieja
 * tiene que seguir contando para el que heredó su cartera. Eso es lo que se
 * carga acá, explícito, en vez de adivinarse por zona.
 *
 * Es código→código y no usuario→usuario porque el antecesor normalmente ya no
 * tiene usuario en la app: existe sólo como código en el maestro Vendedores
 * de Magnus (por eso el catálogo incluye a los dados de baja).
 *
 * REGLA DE ORO: un código lo hereda UNO SOLO (unique en la base). Es lo que
 * garantiza que ningún peso se cuente dos veces. Si el alta devuelve 409, es
 * eso: hay que sacárselo al otro primero.
 */
type Antecesor = {
  id: number;
  sucesorCodigo: number;
  antecesorCodigo: number;
  nota: string | null;
};

function PanelAntecesores({
  vendedores,
  vendedoresError,
}: {
  vendedores: Vendedor[];
  vendedoresError: boolean;
}) {
  const [items, setItems] = useState<Antecesor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sucesor, setSucesor] = useState("");
  const [antecesor, setAntecesor] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch("/api/admin/usuarios/antecesores");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      setItems(d.items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cargar la sucesión de vendedores");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const nombreDe = (codigo: number) =>
    vendedores.find((v) => v.codigo === codigo)?.nombre ?? null;

  // Se muestra el nombre apenas el número tipeado matchea el catálogo: es la
  // única forma de darse cuenta de que uno se equivocó de código antes de
  // guardar (hay dos maestros con los mismos rangos, ver CeldaVendedor).
  const eco = (texto: string) => {
    const n = Number(texto);
    if (!texto.trim() || !Number.isInteger(n)) return null;
    if (vendedoresError) return null;
    return nombreDe(n) ?? "no está en el maestro de Magnus";
  };

  async function agregar() {
    const s = Number(sucesor);
    const a = Number(antecesor);
    if (!Number.isInteger(s) || !Number.isInteger(a)) {
      toast.error("Faltan los dos códigos");
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch("/api/admin/usuarios/antecesores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucesorCodigo: s,
          antecesorCodigo: a,
          nota: nota.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success("Sucesión guardada");
      setSucesor("");
      setAntecesor("");
      setNota("");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: number) {
    try {
      const r = await fetch(`/api/admin/usuarios/antecesores?id=${id}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success("Sucesión eliminada");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo borrar");
    }
  }

  return (
    <div className="rounded-lg ring-1 ring-foreground/10 p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">Sucesión de vendedores</h2>
        <p className="text-sm text-muted-foreground">
          Cuando un vendedor se va o cambia de área, acá se dice quién se queda con su
          cartera. El sucesor pasa a ver, en Ventas y en Faltantes, también lo que vendió
          el antecesor — sin eso esa venta queda sin dueño y sólo aparece en el total de
          la empresa.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Un código lo puede heredar una sola persona: si dos lo heredaran, esa venta se
          contaría dos veces y la suma de las vistas dejaría de dar el total de la empresa.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Se queda con la cartera</Label>
          <Input
            className="w-32"
            inputMode="numeric"
            placeholder="código"
            value={sucesor}
            onChange={(e) => setSucesor(e.target.value)}
          />
          <span className="text-[11px] text-muted-foreground h-4">{eco(sucesor)}</span>
        </div>
        <ArrowRight className="size-4 mb-7 text-muted-foreground rotate-180" />
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Vendedor que se fue</Label>
          <Input
            className="w-32"
            inputMode="numeric"
            placeholder="código"
            value={antecesor}
            onChange={(e) => setAntecesor(e.target.value)}
          />
          <span className="text-[11px] text-muted-foreground h-4">{eco(antecesor)}</span>
        </div>
        <div className="flex flex-col gap-1 grow min-w-48">
          <Label className="text-xs">Nota (opcional)</Label>
          <Input
            placeholder="se fue 04/2026, pasó a compras…"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <span className="h-4" />
        </div>
        <Button size="sm" disabled={guardando} onClick={agregar} className="mb-4">
          {guardando ? <Loader2 className="animate-spin" /> : null}
          Agregar
        </Button>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin sucesiones cargadas: cada vendedor ve sólo lo que facturó con su propio
          código.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-2">
              <span className="font-medium">
                {nombreDe(it.sucesorCodigo) ?? `(${it.sucesorCodigo})`}
              </span>
              <span className="text-muted-foreground text-xs">
                {it.sucesorCodigo}
              </span>
              <span className="text-muted-foreground">hereda</span>
              <span className="font-medium">
                {nombreDe(it.antecesorCodigo) ?? `(${it.antecesorCodigo})`}
              </span>
              <span className="text-muted-foreground text-xs">
                {it.antecesorCodigo}
              </span>
              {it.nota && (
                <span className="text-xs text-muted-foreground truncate">
                  · {it.nota}
                </span>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => borrar(it.id)}
                title="Sacar la sucesión: el antecesor vuelve a quedar sin dueño"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
