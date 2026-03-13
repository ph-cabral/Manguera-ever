"use server";

import { prisma } from "../lib/prisma";
import { revalidatePath } from "next/cache";

export async function getPersonalAction() {
  return await prisma.personal.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
}

export async function getManguerasAction() {
  return await prisma.manguera.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function addMangueraAction(formData: FormData) {
  const codigo = (formData.get("codigo") as string).toUpperCase().trim();
  const metros = parseInt(formData.get("metros") as string);
  const ubicacion = (formData.get("ubicacion") as string).toUpperCase().trim();

  if (!codigo || isNaN(metros) || metros <= 0) {
    throw new Error("Datos inválidos");
  }

  await prisma.manguera.create({
    data: {
      codigo,
      metros,
      ubicacion: ubicacion || null,
    },
  });

  revalidatePath("/");
}

export async function cortarMangueraAction(
  id: number,
  metrosUsados: number,
  personalId: number,
) {
  if (!id || isNaN(metrosUsados) || !personalId) {
    throw new Error("Datos inválidos");
  }

  const rollo = await prisma.manguera.findUnique({
    where: { id },
  });

  if (!rollo) throw new Error("Rollo no encontrado");

  const nuevosMetros = rollo.metros + metrosUsados;

  if (nuevosMetros <= 0) {
    // Registrar corte antes de eliminar
    await prisma.corte.create({
      data: {
        metros: Math.abs(metrosUsados),
        personalId,
        mangueraId: id,
      },
    });
    await prisma.manguera.delete({ where: { id } });
  } else {
    await prisma.$transaction([
      prisma.corte.create({
        data: {
          metros: Math.abs(metrosUsados),
          personalId,
          mangueraId: id,
        },
      }),
      prisma.manguera.update({
        where: { id },
        data: { metros: nuevosMetros },
      }),
    ]);
  }

  revalidatePath("/");
}

export async function addPersonalAction(formData: FormData) {
  const nombre = (formData.get("nombre") as string).toUpperCase().trim();
  const dni = (formData.get("dni") as string)?.trim() || null;

  if (!nombre) {
    throw new Error("El nombre es obligatorio");
  }

  await prisma.personal.create({
    data: {
      nombre,
      dni,
    },
  });

  revalidatePath("/");
}

