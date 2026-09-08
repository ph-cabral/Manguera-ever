import { getSession } from "@/lib/auth/session";
import { moduleForPath, viewForPath } from "@/lib/auth/modules";

/**
 * Acceso a datos de COMPRAS desde el chat de Vicki (intent "compras" en
 * vicki_chat/app/compras_tools.py): faltantes del mes, órdenes de compra e
 * ingresos, valorizados a precio de venta.
 *
 * CRITERIO: el permiso es el MISMO que el de la vista /compras. Si podés
 * entrar a la pantalla, el chat te contesta lo que ya ves ahí; si no, no. No
 * hay una bandera nueva por usuario a propósito — habría que mantener dos
 * fuentes de verdad para el mismo dato y se desincronizan solas.
 *
 * DIFERENCIA con resolverAccesoVickiVentas() / resolverAccesoVickiRrhh():
 *   · Esos dos leen una columna de Postgres EN VIVO, así que activar a alguien
 *     surte efecto en su próximo mensaje. Este lee la COOKIE de sesión, donde
 *     los permisos se hornean al loguear (ver lib/auth/permissions.ts), así que
 *     un permiso recién dado **necesita relogin** — exactamente igual que para
 *     entrar a la vista. Es el mismo comportamiento que el usuario ya conoce.
 *   · No hay filtro por persona (no existe un equivalente al vendedorCodigo):
 *     un faltante "a medias" no sirve para decidir una compra.
 *
 * Se replica el chequeo del middleware (rol ADMIN → módulo → vista) en vez de
 * llamarlo: middleware.ts corre en el runtime edge sobre un request, y acá se
 * necesita el veredicto sobre la sesión, sin request de por medio.
 */
const RUTA_COMPRAS = "/compras";

export type AccesoVickiCompras =
  | { ok: true; habilitado: boolean }
  | { ok: false; status: number; error: string };

export async function resolverAccesoVickiCompras(): Promise<AccesoVickiCompras> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "No autenticado" };

  if (session.rol === "ADMIN") return { ok: true, habilitado: true };

  // Módulo: sin él el middleware ya lo rebota de /compras.
  const mod = moduleForPath(RUTA_COMPRAS);
  if (mod && !session.mods?.includes(mod)) return { ok: true, habilitado: false };

  // Vista: las cookies viejas no traen `vistas` — el middleware las deja pasar,
  // así que acá también (si no, el chat le diría que no a alguien que sí puede
  // abrir la pantalla, hasta que le caduque la sesión).
  const vista = viewForPath(RUTA_COMPRAS);
  if (vista && session.vistas && !session.vistas.includes(vista.href)) {
    return { ok: true, habilitado: false };
  }

  return { ok: true, habilitado: true };
}
