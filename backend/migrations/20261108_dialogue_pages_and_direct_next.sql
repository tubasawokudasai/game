-- ==============================================================================
-- 对话剧本重构：节点内多段台词 (pages) + 无分支直连 (direct_next_node_id)
--
-- 本次结构不再兼容旧版单 content / 必须建 option 的剧本数据。
-- 按要求清空全部旧剧本资产、节点、选项、剧情进度与旧入口路由。
-- ==============================================================================

-- 1. 新增节点级多段台词与直连字段
ALTER TABLE dialogue_nodes ADD COLUMN pages_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dialogue_nodes ADD COLUMN direct_next_node_id TEXT DEFAULT NULL;

-- 2. 清空旧剧本数据（顺序：边 -> 节点 -> 剧本 -> 进度/路由/通知）
DELETE FROM dialogue_options;
DELETE FROM dialogue_nodes;
DELETE FROM player_story_progress;
DELETE FROM npc_dialogue_routers;
DELETE FROM dialogue_entry_nodes;
DELETE FROM story_notifications;
DELETE FROM dialogue_packages;

-- 3. 清理旧剧本挂载/自动生成的剧情 NPC
DELETE FROM npc_instances WHERE instance_type = 'WORLD' AND source = 'DIALOGUE';
UPDATE npc_instances SET dialogue_package_id = NULL, dialogue_root_node_id = NULL;
UPDATE npc_templates SET dialogue_package_id = NULL, dialogue_root_node_id = NULL;

-- 4. 清理旧节点触发器幂等标记
DELETE FROM player_dialogue_flags WHERE flag_key LIKE '__story_trigger_%';
