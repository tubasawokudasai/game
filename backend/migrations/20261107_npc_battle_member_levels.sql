-- ==============================================================================
-- 地图 NPC 专属敌方槽位等级
--
-- 背景：monster_group_members.level 是战斗配置的默认等级，多个地图 NPC 可以共用同一套配置。
-- 本迁移为 WORLD npc_instances 增加逐槽等级覆盖，编辑地图 NPC 时可按战斗配置列出敌人并单独设等级。
--
-- 格式：{"0":20,"1":15,"2":18}，key 为 monster_group_members.slot_index。
-- 未覆盖的槽位继续使用 monster_group_members.level。
-- ==============================================================================

ALTER TABLE npc_instances ADD COLUMN battle_member_levels_json TEXT NOT NULL DEFAULT '{}';
