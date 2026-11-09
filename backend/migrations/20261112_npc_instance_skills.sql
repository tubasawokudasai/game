-- ==============================================================================
-- 迁移: 为 npc_instances 增加技能配置 (skills_json)
-- 允许每个 NPC 实例定制装配技能列表，为空或未配置时回退继承自其模板 npc_templates.skills_json
--
-- 执行:
--   npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261112_npc_instance_skills.sql
--   npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261112_npc_instance_skills.sql
-- ==============================================================================

ALTER TABLE npc_instances ADD COLUMN skills_json TEXT DEFAULT NULL;
