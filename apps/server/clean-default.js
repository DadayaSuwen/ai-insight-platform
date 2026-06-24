const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function go() {
  await p.$queryRawUnsafe(`DELETE FROM "LLMConfig" WHERE id = 'default'`);
  const remaining = await p.$queryRawUnsafe(`SELECT id FROM "LLMConfig"`);
  console.log('Remaining:', JSON.stringify(remaining));
  await p.$disconnect();
}
go();
