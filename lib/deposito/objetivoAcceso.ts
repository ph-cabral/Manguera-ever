import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Quién puede CARGAR/EDITAR los objetivos mensuales del ranking de operarios
 * de /deposito (las 3 líneas del gráfico: objetivo, sobresaliente y bajo
 * rendimiento) — 2026-09-09.
 *
 * Reglas:
 *   · ADMIN: siempre.
 *   · No-admin: sólo si `usuario.depositoObjetivoAcceso = true` (encargado de
 *     depósito; lo asigna un admin en /admin/usuarios, columna "Obj. depósito").
 *
 * LEER los objetivos no pasa por acá: los ve cualquiera que entre a /deposito
 * (lo cubre el módulo "deposito" del middleware). Esta bandera es sólo el
 * candado de escritura — el número es el mismo para todos, lo que cambia es
 * quién lo fija.
 *
 * Se resuelve en VIVO contra Postgres (no desde la cookie), igual que
 * resolverAccesoVickiRrhh(): darle o sacarle la bandera a alguien toma efecto
 * en su próxima acción, sin relogin.
 */
export type AccesoObjetivoDeposito =
  | { ok: true; puedeEditar: boolean }
  | { ok: false; status: number; error: string };

export async function resolverAccesoObjetivoDeposito(): Promise<AccesoObjetivoDeposito> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "No autenticado" };

  if (session.rol === "ADMIN") return { ok: true, puedeEditar: true };

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.uid },
    select: { depositoObjetivoAcceso: true },
  });

  return { ok: true, puedeEditar: usuario?.depositoObjetivoAcceso === true };
}
