import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const usuarios = [
    { nombre: "Juan Pérez" },
    { nombre: "María González" },
    { nombre: "Carlos Rodríguez" },
  ];

  for (const usuario of usuarios) {
    await prisma.usuario.create({ data: usuario });
  }

  console.log("Usuarios creados");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
