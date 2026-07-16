-- ============================================================
-- [Sprint 2] V3 — ChatSession.dataSourceId
-- ------------------------------------------------------------
-- 把会话绑到具体数据源。NULL = 兜底用 superstore-demo (向后兼容)。
-- ForeignKey 故意不引入(数据源可独立删除 + 历史会话保留)
-- ============================================================

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "dataSourceId" TEXT;

-- CreateIndex
CREATE INDEX "ChatSession_dataSourceId_idx" ON "ChatSession"("dataSourceId");
