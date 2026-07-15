/**
 * [Fix-8 Task 8.1] 种子脚本 — 创建默认管理员
 *
 * 首次 pnpm db:seed 后, 数据库中有:
 *   demo@local.dev / demo123 (管理员)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

async function main() {
  console.log('Seed: 创建默认管理员...');

  const existing = await prisma.user.findUnique({
    where: { id: DEFAULT_USER_ID },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash('demo123', 10);
    await prisma.user.create({
      data: {
        id: DEFAULT_USER_ID,
        email: 'demo@local.dev',
        passwordHash,
        name: 'Demo Admin',
        role: 'ADMIN',
        status: 'active',
      },
    });
    console.log('✓ 默认管理员已创建: demo@local.dev / demo123');
  } else {
    console.log('✓ 默认管理员已存在, 跳过');
  }
}

main()
  .catch((e) => {
    console.error('Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
