import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

// Activar/desactivar o cambiar el rol de un usuario.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const data: {
    activo?: boolean;
    rol?: string;
    passwordHash?: string;
    vendedorCodigo?: number | null;
    bulonesAccesoTotal?: boolean;
    vickiVentasAcceso?: boolean;
    vickiRrhhAcceso?: boolean;
    depositoObjetivoAcceso?: boolean;
  } = {};
  if (typeof body?.activo === "boolean") data.activo = body.activo;
  if (body?.rol === "ADMIN" || body?.rol === "USUARIO") data.rol = body.rol;

  // Vendedor asignado (Magnus, Ped_Usu_Arma) — para /ventas/vendedor (2026-08-14). `null` desasigna (el usuario vuelve a ver 0
  // clientes en esa vista hasta que se le asigne otro).
  if ("vendedorCodigo" in body) {
    if (body.vendedorCodigo === null) {
      data.vendedorCodigo = null;
    } else {
      const v = Number(body.vendedorCodigo);
      if (!Number.isInteger(v)) {
        return NextResponse.json({ error: "vendedorCodigo inválido" }, { status: 400 });
      }
      data.vendedorCodigo = v;
    }
  }

  // Acceso total a bulonería (2026-08-28): el usuario ve el 100% de la
  // empresa en /ventas/bulones aunque no sea admin. NO afecta a
  // /ventas/vendedor ni al resto de la app — ver lib/ventas/bulonesAcceso.ts.
  if (typeof body?.bulonesAccesoTotal === "boolean") {
    data.bulonesAccesoTotal = body.bulonesAccesoTotal;
  }

  // Acceso a datos de ventas desde el chat de Vicki (2026-09-05): habilita el
  // intent "ventas" para este usuario, SIEMPRE filtrado por su propio
  // vendedorCodigo — ver lib/ventas/vickiVentasAcceso.ts.
  if (typeof body?.vickiVentasAcceso === "boolean") {
    data.vickiVentasAcceso = body.vickiVentasAcceso;
  }

  // Acceso a datos de asistencia desde el chat de Vicki (intent "rrhh"):
  // faltas, feriados y horas extra. NO se filtra por persona — el que lo tiene
  // ve a toda la empresa. Ver lib/rrhh/vickiRrhhAcceso.ts.
  if (typeof body?.vickiRrhhAcceso === "boolean") {
    data.vickiRrhhAcceso = body.vickiRrhhAcceso;
  }

  // Encargado de depósito (2026-09-09): puede cargar/editar los OBJETIVOS
  // mensuales del ranking de operarios de /deposito (las 3 líneas del
  // gráfico). No cambia qué datos ve ni a qué vistas entra — sólo habilita el
  // botón. Ver lib/deposito/objetivoAcceso.ts.
  if (typeof body?.depositoObjetivoAcceso === "boolean") {
    data.depositoObjetivoAcceso = body.depositoObjetivoAcceso;
  }

  // Reseteo de contraseña: el admin asigna una nueva (mín. 6 caracteres).
  if (body?.password !== undefined) {
    const password = String(body.password);
    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 },
      );
    }
    data.passwordHash = hashPassword(password);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  // No dejar el sistema sin ningún admin activo.
  const quitaAdmin = data.activo === false || data.rol === "USUARIO";
  if (quitaAdmin) {
    const target = await prisma.usuario.findUnique({ where: { id }, select: { rol: true } });
    if (target?.rol === "ADMIN") {
      const otros = await prisma.usuario.count({
        where: { rol: "ADMIN", activo: true, id: { not: id } },
      });
      if (otros === 0) {
        return NextResponse.json(
          { error: "No podés dejar el sistema sin un admin activo" },
          { status: 409 },
        );
      }
    }
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data,
      select: {
      id: true,
      nombre: true,
      rol: true,
      activo: true,
      vendedorCodigo: true,
      bulonesAccesoTotal: true,
      vickiVentasAcceso: true,
      vickiRrhhAcceso: true,
      depositoObjetivoAcceso: true,
    },
    });
    return NextResponse.json({ ok: true, usuario });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}
