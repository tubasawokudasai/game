-- ==============================================================================
-- 迁移: 邮件系统发放 (mail_attachments 类型化发放字段)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空已有表
--
-- 执行:
--   npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_system_grants.sql
--   npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_system_grants.sql
--
-- 说明:
--   grant_type    发放类型: ITEM(道具) / COMPANION(角色伙伴) / CURRENCY(货币)
--                 后续新增 EQUIPMENT 等类型只需扩展该字段与 grantService 的处理器。
--   grant_payload 类型专属参数 JSON，例如:
--                 ITEM      { "itemId":"item_juqi_dan", "name":"聚气丹", "count":10 }
--                 COMPANION { "memberKey":"npc_cangyun_001", "level":66, "realm":"金丹中期", "isActive":true }
--                 CURRENCY  { "silver":10000, "ingot":100, "copper":0 }
--
-- 注意：SQLite 不支持 ADD COLUMN IF NOT EXISTS。
-- 若目标库已执行过本迁移（mail_attachments 已有 grant_type），跳过本文件即可。
-- 新库直接执行 schema.sql 即可，无需本迁移。
-- ==============================================================================

ALTER TABLE mail_attachments ADD COLUMN grant_type TEXT NOT NULL DEFAULT 'ITEM';
ALTER TABLE mail_attachments ADD COLUMN grant_payload TEXT;

CREATE INDEX IF NOT EXISTS idx_attachments_mail_grant ON mail_attachments(mail_id, grant_type);
