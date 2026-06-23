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

  // Seed LLM configs — one row per provider
  await prisma.lLMConfig.upsert({
    where: { id: 'ollama' },
    update: {},
    create: {
      id: 'ollama',
      model: 'qwen3:8b',
      temperature: 0,
      baseUrl: 'http://localhost:11434',
    },
  });

  await prisma.lLMConfig.upsert({
    where: { id: 'openai' },
    update: {},
    create: {
      id: 'openai',
      model: 'gpt-4o',
      temperature: 0,
    },
  });

  await prisma.lLMConfig.upsert({
    where: { id: 'anthropic' },
    update: {},
    create: {
      id: 'anthropic',
      model: 'claude-3-5-sonnet-20240620',
      temperature: 0,
    },
  });

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