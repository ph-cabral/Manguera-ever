"use server";

import { prisma } from "../lib/prisma";
import { revalidatePath } from "next/cache";

export async function getUsuariosAction() {
  return await prisma.usuario.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true }, // Solo lo necesario
  });
}


// Obtener todas las mangueras (rollos individuales)
export async function getManguerasAction() {
  return await prisma.manguera.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      usuario: {
        select: { nombre: true }, // Traemos solo el nombre del que registró
      },
    },
  });
}

// Agregar nueva manguera/recorte
export async function addMangueraAction(formData: FormData) {
  const codigo = (formData.get("codigo") as string).toUpperCase().trim();
  const metros = parseInt(formData.get("metros") as string); // Int, no Float
  const ubicacion = (formData.get("ubicacion") as string).toUpperCase().trim();
  const usuarioId = parseInt(formData.get("usuarioId") as string);

  if (!codigo || isNaN(metros) || metros <= 0 || isNaN(usuarioId)) {
    throw new Error("Datos inválidos");
  }

  await prisma.manguera.create({
    data: {
      codigo: codigo,
      metros: metros,
      ubicacion: ubicacion || null,
      usuarioId,
    },
  });

  revalidatePath("/");
}


export async function cortarMangueraAction(id: number, metrosUsados: number) {
  "use server";

  // Buscar el rollo
  const rollo = await prisma.manguera.findUnique({
    where: { id },
  });

  if (!rollo) throw new Error("Rollo no encontrado");
//aca esta sumando pero no encontre el porque termina inertido, aca esta restando realmente
  const nuevosMetros = rollo.metros + metrosUsados;

  if (nuevosMetros <= 0) {
    // Si se acabó o usaron más de lo que había, eliminar el registro
    await prisma.manguera.delete({ where: { id } });
  } else {
    // Actualizar metros restantes
    await prisma.manguera.update({
      where: { id },
      data: { metros: nuevosMetros },
    });
  }

  revalidatePath("/");
}
// Eliminar un registro específico por ID
export async function deleteMangueraAction(id: number) {
  await prisma.manguera.delete({
    where: { id },
  });
  revalidatePath("/");
}
