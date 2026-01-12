const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pack = await prisma.wordPack.create({
    data: {
      name: 'Default Pack',
      category: 'Objetos',
      words: ['manzana', 'silla', 'reloj', 'guitarra', 'lámpara', 'libro', 'casa', 'árbol'],
    },
  });
  console.log('Seeded WordPack:', pack.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
