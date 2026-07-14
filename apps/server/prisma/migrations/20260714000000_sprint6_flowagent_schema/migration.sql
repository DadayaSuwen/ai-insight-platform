-- Sprint 6: FlowAgent schema — RBAC + Schema探索 + 洞察
-- Adds role/name/status to User, exploreStatus/schemaUnderstanding to DataSource,
-- and new tables: SchemaReview, Insight, InviteCode

-- Alter User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

-- Alter DataSource
ALTER TABLE "DataSource" ADD COLUMN IF NOT EXISTS "exploreStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "DataSource" ADD COLUMN IF NOT EXISTS "schemaUnderstanding" JSONB;

-- Create SchemaReview
CREATE TABLE IF NOT EXISTS "SchemaReview" (
    "id" TEXT NOT NULL,
    "datasourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pendingFields" INTEGER NOT NULL DEFAULT 0,
    "confirmedFields" INTEGER NOT NULL DEFAULT 0,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "SchemaReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SchemaReview_datasourceId_idx" ON "SchemaReview"("datasourceId");

ALTER TABLE "SchemaReview" ADD CONSTRAINT "SchemaReview_datasourceId_fkey"
  FOREIGN KEY ("datasourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create Insight
CREATE TABLE IF NOT EXISTS "Insight" (
    "id" TEXT NOT NULL,
    "datasourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "suggestion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Insight_datasourceId_detectedAt_idx" ON "Insight"("datasourceId", "detectedAt");

ALTER TABLE "Insight" ADD CONSTRAINT "Insight_datasourceId_fkey"
  FOREIGN KEY ("datasourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create InviteCode
CREATE TABLE IF NOT EXISTS "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 10,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InviteCode_code_key" ON "InviteCode"("code");
