-- ==============================================================================
-- 迁移: 出战队伍出战/休息状态 (增量、幂等约束同其他迁移)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空已有表
-- 执行: npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_party_active.sql
--       npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_party_active.sql
--
-- 注意：SQLite 不支持 ADD COLUMN IF NOT EXISTS。
-- 若目标库已执行过本迁移（或由最新 schema.sql 全新建库），请跳过本文件。
-- ==============================================================================

-- 1: 出战（占用出战席位），0: 休息（留在队伍列表中待命）
ALTER TABLE party_members ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_party_members_active ON party_members(player_id, is_active);
