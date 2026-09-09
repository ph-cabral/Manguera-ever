import { getSession } from "@/lib/auth/session";

/**
 * Quién puede CARGAR/EDITAR los objetivos de venta por vendedor (pestaña
 * "Pulso" de /ventas/bulones) — 2026-09-09.
 *
 * Reglas:
 *   · ADMIN: escribe.
 *   · Cualquier usuario autenticado: LEE.
 *
 * Leer es abierto a propósito: el objetivo es el mismo número para todos y el
 * vendedor tiene que poder ver contra qué se lo mide. Lo que se cierra es
 * quién lo fija. La vista en sí ya está protegida por el módulo "ventas" del
 * middleware, así que acá no se vuelve a resolver el permiso de pantalla.
 *
 * A diferencia de /deposito (que tiene la bandera `depositoObjetivoAcceso`
 * para el encargado), acá no hay bandera todavía: el objetivo comercial lo
 * fija Dirección. Si algún día lo tiene que cargar un jefe de ventas, se
 * agrega la bandera en `usuario` y se la lee acá, sin tocar la ruta.
 */
export type AccesoObjetivoVentas =
  | { ok: true; puedeEditar: boolean }
  | { ok: false; status: number; error: string };

export async function resolverAccesoObjetivoVentas(): Promise<AccesoObjetivoVentas> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "No autenticado" };
  return { ok: true, puedeEditar: session.rol === "ADMIN" };
}
