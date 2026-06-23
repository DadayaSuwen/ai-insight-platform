import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create sample sales data
  const salesData = [
    { productName: 'Product A', category: 'Electronics', amount: 1000, quantity: 10, region: 'North' },
    { productName: 'Product B', category: 'Electronics', amount: 1500, quantity: 5, region: 'South' },
    { productName: 'Product C', category: 'Clothing', amount: 500, quantity: 20, region: 'North' },
    { productName: 'Product D', category: 'Clothing', amount: 300, quantity: 15, region: 'South' },
    { productName: 'Product E', category: 'Food', amount: 200, quantity: 50, region: 'East' },
  ];

  for (const sale of salesData) {
    await prisma.sales.create({ data: sale });
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    const proc = (globalThis as any).process;
    if (proc) proc.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });