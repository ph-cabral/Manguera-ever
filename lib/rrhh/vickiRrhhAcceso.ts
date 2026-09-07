import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Acceso a datos de ASISTENCIA desde el chat de Vicki (intent "rrhh" en
 * vicki_chat/app/asistencia_tools.py): faltas, feriados y horas extra.
 *
 * Reglas:
 *   · ADMIN: habilitado siempre.
 *   · No-admin: habilitado SOLO si `usuario.vickiRrhhAcceso = true` (lo asigna
 *     un admin en /admin/usuarios, columna "Vicki RRHH").
 *
 * DIFERENCIA IMPORTANTE con resolverAccesoVickiVentas(): acá el permiso es
 * TODO O NADA. No existe un equivalente al `vendedorCodigo` que recorte lo que
 * se ve, porque un número de asistencia parcial no sirve para nada: quien
 * pregunta "quién hizo horas extras" necesita la lista completa. Por eso esta
 * bandera se da con cuentagotas, a RRHH — habilitar a alguien es darle la
 * asistencia de todos sus compañeros.
 *
 * Se resuelve en VIVO contra Postgres (no desde la cookie), igual que el resto:
 * activar o desactivar a alguien surte efecto en su próximo mensaje al chat,
 * sin relogin.
 */
export type AccesoVickiRrhh =
  | { ok: true; habilitado: boolean }
  | { ok: false; status: number; error: string };

export async function resolverAccesoVickiRrhh(): Promise<AccesoVickiRrhh> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "No autenticado" };

  if (session.rol === "ADMIN") return { ok: true, habilitado: true };

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.uid },
    select: { vickiRrhhAcceso: true },
  });

  return { ok: true, habilitado: usuario?.vickiRrhhAcceso === true };
}
