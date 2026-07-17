/**
 * 种子脚本 — 创建默认管理员
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
    const passwordHash = await bcrypt.hash('housuwen', 10);
    await prisma.user.create({
      data: {
        id: DEFAULT_USER_ID,
        email: '1179002658@qq.com',
        passwordHash,
        name: 'Admin',
        role: 'admin',
        status: 'active',
      },
    });
    console.log('✓ 默认管理员已创建: 1179002658@qq.com');
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

