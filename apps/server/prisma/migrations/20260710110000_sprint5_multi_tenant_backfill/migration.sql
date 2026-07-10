-- ============================================================
-- [Sprint 5] Multi-Tenant Migration — backfill + add FK (idempotent)
-- ============================================================

-- 1. Create User 表(若不存在)
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- 2. 默认用户 (demo@local.dev / demo123)
INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000000', 'demo@local.dev', '$2b$10$ZaGRNHrQ5qgL8hZCdVbe9OgfgiGwwG5QJpAxdIObJWoSeywPko20C', NOW())
ON CONFLICT ("id") DO NOTHING;

-- 3. DataSource.userId — 先 add column(若不存在),后 update,再 NOT NULL + FK
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DataSource') THEN
    -- add column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'DataSource' AND column_name = 'userId'
    ) THEN
      ALTER TABLE "DataSource" ADD COLUMN "userId" TEXT;
    END IF;
    UPDATE "DataSource" SET "userId" = '00000000-0000-0000-0000-000000000000' WHERE "userId" IS NULL;
    BEGIN
      ALTER TABLE "DataSource" ALTER COLUMN "userId" SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'DataSource_userId_fkey'
    ) THEN
      ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    CREATE INDEX IF NOT EXISTS "DataSource_userId_idx" ON "DataSource"("userId");
  END IF;
END $$;

-- 4. ChatSession.userId
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ChatSession') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'ChatSession' AND column_name = 'userId'
    ) THEN
      ALTER TABLE "ChatSession" ADD COLUMN "userId" TEXT;
    END IF;
    UPDATE "ChatSession" SET "userId" = '00000000-0000-0000-0000-000000000000' WHERE "userId" IS NULL;
    BEGIN
      ALTER TABLE "ChatSession" ALTER COLUMN "userId" SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ChatSession_userId_fkey'
    ) THEN
      ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    CREATE INDEX IF NOT EXISTS "ChatSession_userId_idx" ON "ChatSession"("userId");
  END IF;
END $$;