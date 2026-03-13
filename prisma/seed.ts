import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const personal = [
    { nombre: "Diego Furrer" },
  ];

  for (const persona of personal) {
    await prisma.personal.create({ data: persona });
  }

  console.log("Personal creado");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
