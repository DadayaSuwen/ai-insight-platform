-- =============================================================================
-- One-time migration: 给老 metadata 里的 tool_call 补真 UUID
-- =============================================================================
-- 背景：
--   修复 chat.service.ts buildHistoryMessages 之前，老数据里 toolCalls[*] 和
--   toolResults[*] 都没有 id 字段。LLM API 严格校验 tool_call_id 全局唯一，
--   Ollama 复用的"函数名 id"会导致 400 Duplicate value。
--
-- 适用版本：
--   适用于 Phase 12 修复点（chat.service.ts 改为保存时生成 UUID）之前的存量数据。
--   修复点之后的代码会在保存时自动写 id，本 SQL 不会再改变它们。
--
-- 用法：
--   psql "$DATABASE_URL" -f one-time-fix-tool-call-ids.sql
--   （或在任何 pg 客户端里跑整段，BEGIN/COMMIT 保证原子性）
--
-- 干两件事：
--   1. toolCalls[i] 没有 id 的，给它分配 gen_random_uuid()
--   2. toolResults[i] 没有 id 的，从同下标的 toolCalls[i].id 复制（保证配对）
-- =============================================================================

BEGIN;

-- 保险：PG 13+ 自带 gen_random_uuid()，老版本需要 pgcrypto
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Step 1: 给 toolCalls[*] 补 id（用 WITH ORDINALITY 拿 index）
-- -----------------------------------------------------------------------------
WITH tc_with_id AS (
  SELECT
    cm.id AS msg_id,
    jsonb_agg(
      CASE
        WHEN elem ? 'id' THEN elem
        ELSE elem || jsonb_build_object('id', gen_random_uuid()::text)
      END
      ORDER BY ord
    ) AS new_tool_calls
  FROM "ChatMessage" cm
  CROSS JOIN LATERAL jsonb_array_elements(cm.metadata->'toolCalls')
    WITH ORDINALITY AS t(elem, ord)
  WHERE cm.role = 'assistant'
    AND cm.metadata IS NOT NULL
    AND cm.metadata ? 'toolCalls'
    AND jsonb_array_length(cm.metadata->'toolCalls') > 0
  GROUP BY cm.id
)
UPDATE "ChatMessage" cm
SET metadata = cm.metadata
  || jsonb_build_object('toolCalls', tc.new_tool_calls)
FROM tc_with_id tc
WHERE cm.id = tc.msg_id;

-- -----------------------------------------------------------------------------
-- Step 2: 给 toolResults[*] 补 id（按 index 从同位置 toolCalls 复制）
-- -----------------------------------------------------------------------------
-- 旧数据是 planner 严格按序发射的，所以同下标天然配对。
-- 如果某条 toolResult 没有对应 toolCall（防御性），就单独分配一个 UUID。
WITH tr_with_id AS (
  SELECT
    cm.id AS msg_id,
    jsonb_agg(
      CASE
        WHEN tr_elem ? 'id' THEN tr_elem
        WHEN ord - 1 < jsonb_array_length(cm.metadata->'toolCalls')
          THEN tr_elem || jsonb_build_object(
            'id', cm.metadata->'toolCalls'->(ord - 1)->>'id'
          )
        ELSE tr_elem || jsonb_build_object('id', gen_random_uuid()::text)
      END
      ORDER BY ord
    ) AS new_tool_results
  FROM "ChatMessage" cm
  CROSS JOIN LATERAL jsonb_array_elements(cm.metadata->'toolResults')
    WITH ORDINALITY AS t(tr_elem, ord)
  WHERE cm.role = 'assistant'
    AND cm.metadata IS NOT NULL
    AND cm.metadata ? 'toolResults'
    AND jsonb_array_length(cm.metadata->'toolResults') > 0
  GROUP BY cm.id
)
UPDATE "ChatMessage" cm
SET metadata = cm.metadata
  || jsonb_build_object('toolResults', tr.new_tool_results)
FROM tr_with_id tr
WHERE cm.id = tr.msg_id;

-- -----------------------------------------------------------------------------
-- 验证：抽样 3 条 assistant 消息看 metadata 里的 id 长什么样
-- -----------------------------------------------------------------------------
SELECT
  id,
  jsonb_pretty(metadata->'toolCalls') AS tool_calls,
  jsonb_pretty(metadata->'toolResults') AS tool_results
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata ? 'toolCalls'
  AND jsonb_array_length(metadata->'toolCalls') > 0
LIMIT 3;

-- -----------------------------------------------------------------------------
-- 如果上面验证看着没问题，但你还是想直接清空重来（推荐），解开下面这行注释：
-- -----------------------------------------------------------------------------
-- TRUNCATE "ChatSession" CASCADE;

COMMIT;
