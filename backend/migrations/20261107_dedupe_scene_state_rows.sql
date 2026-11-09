-- 清理 scenes 表中重复的 *_state / *_city 脏数据行
--
-- 规范 id 保留：tianheng / canglan / kunwu / qingyun / changle
-- 重复行删除：tianheng_state / canglan_state / kunwu_state / qingyun_state / changle_city
--
-- 顺序很重要：先把所有引用迁到规范 id，再删重复行，
-- 否则 npc_instances / venues 上的 ON DELETE CASCADE 会连带删掉 NPC 和坊市。
-- 注意：scenes.zone_id 是“大区”逻辑键（继续使用 qingyun_state、changle_city 等），
-- 不是场景 id，不能改；删除重复场景行不影响按 zone_id 查询大区。

-- 1) NPC 实例
UPDATE npc_instances
SET scene_id = CASE scene_id
  WHEN 'qingyun_state' THEN 'qingyun'
  WHEN 'tianheng_state' THEN 'tianheng'
  WHEN 'canglan_state' THEN 'canglan'
  WHEN 'kunwu_state' THEN 'kunwu'
  ELSE scene_id
END,
updated_at = CURRENT_TIMESTAMP
WHERE scene_id IN ('qingyun_state', 'tianheng_state', 'canglan_state', 'kunwu_state');

-- 2) 场景内坊市 / 场所
UPDATE venues
SET scene_id = CASE scene_id
  WHEN 'qingyun_state' THEN 'qingyun'
  WHEN 'tianheng_state' THEN 'tianheng'
  WHEN 'canglan_state' THEN 'canglan'
  WHEN 'kunwu_state' THEN 'kunwu'
  ELSE scene_id
END
WHERE scene_id IN ('qingyun_state', 'tianheng_state', 'canglan_state', 'kunwu_state');

-- 3) 子场景的父节点
UPDATE scenes
SET parent_id = CASE parent_id
  WHEN 'qingyun_state' THEN 'qingyun'
  WHEN 'tianheng_state' THEN 'tianheng'
  WHEN 'canglan_state' THEN 'canglan'
  WHEN 'kunwu_state' THEN 'kunwu'
  ELSE parent_id
END,
updated_at = CURRENT_TIMESTAMP
WHERE parent_id IN ('qingyun_state', 'tianheng_state', 'canglan_state', 'kunwu_state');

-- 4) 玩家当前所在子区域（zone_id 是另一个概念，保持不动）
UPDATE players
SET area_id = CASE area_id
  WHEN 'qingyun_state' THEN 'qingyun'
  WHEN 'tianheng_state' THEN 'tianheng'
  WHEN 'canglan_state' THEN 'canglan'
  WHEN 'kunwu_state' THEN 'kunwu'
  ELSE area_id
END,
updated_at = CURRENT_TIMESTAMP
WHERE area_id IN ('qingyun_state', 'tianheng_state', 'canglan_state', 'kunwu_state');

-- 5) 删除重复场景行
DELETE FROM scenes
WHERE id IN ('qingyun_state', 'tianheng_state', 'canglan_state', 'kunwu_state');

-- 6) changle_city 是 changle 的历史重复行：规范 id 为 changle
--    若 changle 不存在，先用 changle_city 的数据补一行，保留后台编辑过的坐标/描述。
INSERT OR IGNORE INTO scenes
  (id, zone_id, name, region, level, parent_id, icon, coord_x, coord_y,
   status_desc, tag, subtitle, thumb, description, feature, cost_desc, btn_text)
SELECT 'changle', zone_id, name, region, level, parent_id, icon, coord_x, coord_y,
       status_desc, tag, subtitle, thumb, description, feature, cost_desc, btn_text
FROM scenes WHERE id = 'changle_city';

-- 引用迁移（zone_id 是大区逻辑键，仍然保留 changle_city，不能改）
UPDATE npc_instances SET scene_id = 'changle' WHERE scene_id = 'changle_city';
UPDATE venues SET scene_id = 'changle' WHERE scene_id = 'changle_city';
UPDATE scenes SET parent_id = 'changle' WHERE parent_id = 'changle_city';
UPDATE players SET area_id = 'changle' WHERE area_id = 'changle_city';

DELETE FROM scenes WHERE id = 'changle_city';

-- changle 是天衡州下的都城，补齐父节点（仅当原数据缺失，避免覆盖后台已配置的层级）
UPDATE scenes
SET level = 2, parent_id = 'tianheng', updated_at = CURRENT_TIMESTAMP
WHERE id = 'changle' AND parent_id IS NULL;

-- 自检 1：重复行应为空
SELECT id FROM scenes
WHERE id IN ('qingyun_state', 'tianheng_state', 'canglan_state', 'kunwu_state', 'changle_city');

-- 自检 2：不应存在指向不存在场景的孤儿引用，均应为空
SELECT 'npc_instances' AS source, npc_id AS ref_id, scene_id AS bad_scene_id
FROM npc_instances
WHERE scene_id IS NOT NULL AND scene_id NOT IN (SELECT id FROM scenes)
UNION ALL
SELECT 'venues', id, scene_id FROM venues
WHERE scene_id NOT IN (SELECT id FROM scenes)
UNION ALL
SELECT 'scenes.parent_id', id, parent_id FROM scenes
WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM scenes)
UNION ALL
SELECT 'players.area_id', id, area_id FROM players
WHERE area_id NOT IN (SELECT id FROM scenes);
